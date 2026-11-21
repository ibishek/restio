use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use base64::Engine;
use reqwest::header::{HeaderName, HeaderValue, CONTENT_TYPE};
use reqwest::{multipart, Client, Method, Url};
use url::form_urlencoded;

use super::auth;
use crate::error::AppError;
use crate::models::{HttpRequest, HttpResponse, StreamChunk};
use tauri::ipc::Channel;

/// Content types we return as base64 rather than lossy UTF-8, so binary bodies
/// (images, PDFs, fonts, …) survive the trip and can be rendered in the UI.
fn is_binary(content_type: &str) -> bool {
    content_type.starts_with("image/")
        || content_type.starts_with("audio/")
        || content_type.starts_with("video/")
        || content_type.starts_with("font/")
        || content_type.starts_with("application/octet-stream")
        || content_type.starts_with("application/pdf")
        || content_type.starts_with("application/zip")
        || content_type.starts_with("application/wasm")
}

/// Threshold above which response bodies are streamed directly to disk to prevent OOM.
pub const STREAM_OFFLOAD_THRESHOLD: usize = 5 * 1024 * 1024; // 5 MB

/// Build the request from the UI's description, send it, and capture the
/// response together with its round-trip timing and byte size.
pub async fn execute(
    req: HttpRequest,
    app: Option<&tauri::AppHandle>,
    on_stream: Option<Channel<StreamChunk>>,
) -> Result<HttpResponse, AppError> {
    let method = Method::from_bytes(req.method.trim().to_uppercase().as_bytes())
        .map_err(|_| AppError::InvalidMethod(req.method.clone()))?;

    let mut url = Url::parse(req.url.trim()).map_err(|e| AppError::InvalidUrl(e.to_string()))?;

    // Append enabled query parameters to whatever the URL already carries, plus
    // an API-key query param when that auth scheme is selected.
    {
        let mut pairs = url.query_pairs_mut();
        for p in &req.params {
            if p.enabled && !p.key.is_empty() {
                pairs.append_pair(&p.key, &p.value);
            }
        }
        if let Some((k, v)) = auth::query_pair(&req.auth) {
            pairs.append_pair(k, v);
        }
    }

    let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(30_000));
    let mut client_builder = Client::builder()
        .timeout(timeout)
        .user_agent(concat!("RestIO/", env!("CARGO_PKG_VERSION")));

    // Intentional (CWE-295 / rust/disabled-certificate-check): RestIO is an API
    // client tool (like Postman / curl). Users need the ability to test localhost
    // and staging endpoints using self-signed TLS certificates. This setting defaults
    // to `false` and is strictly opt-in per request via UI toggle.
    if req.danger_accept_invalid_certs {
        client_builder = client_builder.danger_accept_invalid_certs(true);
    }

    let client = client_builder
        .build()
        .map_err(|e| AppError::Request(e.to_string()))?;

    let mut builder = client.request(method, url);

    // Headers.
    let mut has_content_type = false;
    for h in &req.headers {
        if h.enabled && !h.key.is_empty() {
            let name = HeaderName::from_bytes(h.key.trim().as_bytes())
                .map_err(|_| AppError::InvalidHeader(h.key.clone()))?;
            let value = HeaderValue::from_str(&h.value)
                .map_err(|_| AppError::InvalidHeader(h.key.clone()))?;
            if name == CONTENT_TYPE {
                has_content_type = true;
            }
            builder = builder.header(name, value);
        }
    }

    // Authorization (Bearer / Basic / API-key-in-header). Values are already
    // {{var}}-resolved by the frontend; see `http::auth`.
    builder = auth::apply(builder, &req.auth);

    // Body. Build it per the selected mode, setting a sensible Content-Type only
    // when the user hasn't pinned one via a header. `multipart` is the exception:
    // reqwest sets its own `multipart/form-data; boundary=…` header, so we never
    // touch Content-Type for it. Files (multipart + binary) are read here, from
    // the path the UI stored — their bytes never live in the collection.
    match req.body_mode.as_str() {
        "json" if !req.body.is_empty() => {
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "application/json");
            }
            builder = builder.body(req.body.clone());
        }
        "text" if !req.body.is_empty() => {
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "text/plain; charset=utf-8");
            }
            builder = builder.body(req.body.clone());
        }
        "form" => {
            let mut enc = form_urlencoded::Serializer::new(String::new());
            for f in &req.form_fields {
                if f.enabled && !f.key.is_empty() {
                    enc.append_pair(&f.key, &f.value);
                }
            }
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "application/x-www-form-urlencoded");
            }
            builder = builder.body(enc.finish());
        }
        "multipart" => {
            let mut form = multipart::Form::new();
            for f in &req.multipart {
                if !f.enabled || f.key.is_empty() {
                    continue;
                }
                if f.kind == "file" {
                    if f.file_path.is_empty() {
                        continue;
                    }
                    let bytes = tokio::fs::read(&f.file_path)
                        .await
                        .map_err(|e| AppError::FileRead(f.file_path.clone(), e.to_string()))?;
                    let mime = mime_for_path(&f.file_path);
                    let part = multipart::Part::bytes(bytes)
                        .file_name(file_name_of(&f.file_path))
                        .mime_str(mime)
                        .unwrap_or_else(|_| {
                            multipart::Part::bytes(Vec::new()).file_name(file_name_of(&f.file_path))
                        });
                    form = form.part(f.key.clone(), part);
                } else {
                    form = form.text(f.key.clone(), f.value.clone());
                }
            }
            builder = builder.multipart(form);
        }
        "binary" if !req.binary_path.is_empty() => {
            let bytes = tokio::fs::read(&req.binary_path)
                .await
                .map_err(|e| AppError::FileRead(req.binary_path.clone(), e.to_string()))?;
            if !has_content_type {
                builder = builder.header(CONTENT_TYPE, "application/octet-stream");
            }
            builder = builder.body(bytes);
        }
        // "none", empty bodies, or an unknown mode → send no body.
        _ => {}
    }

    let start = Instant::now();
    let resp = builder
        .send()
        .await
        .map_err(|e| AppError::Request(friendly(&e)))?;

    let status = resp.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();

    let mut headers = BTreeMap::new();
    for (name, value) in resp.headers() {
        headers.insert(
            name.as_str().to_string(),
            value.to_str().unwrap_or("").to_string(),
        );
    }

    let content_type = headers
        .get("content-type")
        .map(|v| v.to_lowercase())
        .unwrap_or_default();

    let content_length = resp.content_length();
    let mut resp = resp;
    let mut size_bytes = 0u64;
    let mut body = String::new();
    let body_encoding: String;
    let mut saved_path = None;
    let mut chunk_index = 0usize;

    if content_length.is_some_and(|len| len >= STREAM_OFFLOAD_THRESHOLD as u64) {
        // Stream directly to file on disk to protect memory
        let file_path = crate::store::download_path_for(app, &content_type)?;
        let mut file = tokio::fs::File::create(&file_path)
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        use tokio::io::AsyncWriteExt;
        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| AppError::Request(friendly(&e)))?
        {
            if let Some(ref channel) = on_stream {
                let text = String::from_utf8_lossy(&chunk).into_owned();
                let elapsed_ms = start.elapsed().as_millis() as u64;
                let _ = channel.send(StreamChunk {
                    index: chunk_index,
                    text,
                    elapsed_ms,
                    bytes: chunk.len(),
                });
                chunk_index += 1;
            }
            size_bytes += chunk.len() as u64;
            file.write_all(&chunk)
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
        }
        file.flush()
            .await
            .map_err(|e| AppError::Storage(e.to_string()))?;
        saved_path = Some(file_path.to_string_lossy().into_owned());
        body_encoding = "file".to_string();
    } else {
        let mut bytes = Vec::new();
        let mut spilled_file = None;
        let mut spilled_path = None;

        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| AppError::Request(friendly(&e)))?
        {
            if let Some(ref channel) = on_stream {
                let text = String::from_utf8_lossy(&chunk).into_owned();
                let elapsed_ms = start.elapsed().as_millis() as u64;
                let _ = channel.send(StreamChunk {
                    index: chunk_index,
                    text,
                    elapsed_ms,
                    bytes: chunk.len(),
                });
                chunk_index += 1;
            }
            if spilled_file.is_none() && bytes.len() + chunk.len() > STREAM_OFFLOAD_THRESHOLD {
                let file_path = crate::store::download_path_for(app, &content_type)?;
                let mut file = tokio::fs::File::create(&file_path)
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                use tokio::io::AsyncWriteExt;
                file.write_all(&bytes)
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                file.write_all(&chunk)
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
                size_bytes = (bytes.len() + chunk.len()) as u64;
                bytes.clear();
                bytes.shrink_to_fit();
                spilled_path = Some(file_path.to_string_lossy().into_owned());
                spilled_file = Some(file);
            } else if let Some(ref mut file) = spilled_file {
                use tokio::io::AsyncWriteExt;
                size_bytes += chunk.len() as u64;
                file.write_all(&chunk)
                    .await
                    .map_err(|e| AppError::Storage(e.to_string()))?;
            } else {
                bytes.extend_from_slice(&chunk);
                size_bytes += chunk.len() as u64;
            }
        }

        if let Some(mut file) = spilled_file {
            use tokio::io::AsyncWriteExt;
            file.flush()
                .await
                .map_err(|e| AppError::Storage(e.to_string()))?;
            saved_path = spilled_path;
            body_encoding = "file".to_string();
        } else {
            let (b, enc) = if is_binary(&content_type) {
                (
                    base64::engine::general_purpose::STANDARD.encode(&bytes),
                    "base64",
                )
            } else {
                (String::from_utf8_lossy(&bytes).into_owned(), "utf8")
            };
            body = b;
            body_encoding = enc.to_string();
        }
    }

    let time_ms = start.elapsed().as_millis() as u64;

    Ok(HttpResponse {
        status: status.as_u16(),
        status_text,
        time_ms,
        size_bytes,
        headers,
        body,
        body_encoding,
        saved_path,
    })
}

/// The final path segment, used as the multipart part's `filename`. Falls back
/// to `"file"` for a pathless string.
fn file_name_of(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string()
}

/// Infer a sensible MIME Content-Type from a file's extension for multipart uploads.
fn mime_for_path(path: &str) -> &'static str {
    let p = std::path::Path::new(path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "json" => "application/json",
        "html" | "htm" => "text/html",
        "txt" | "text" | "log" => "text/plain",
        "xml" => "application/xml",
        "csv" => "text/csv",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "tar" => "application/x-tar",
        "gz" => "application/gzip",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

/// Turn a reqwest error into a short, user-facing message.
fn friendly(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "Request timed out".to_string()
    } else if e.is_connect() {
        "Could not connect to the host".to_string()
    } else {
        e.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{HttpRequest, KeyValue, RequestAuth};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    /// In-process mock HTTP server on an ephemeral loopback port for fully offline testing.
    struct MockServer {
        port: u16,
        shutdown: std::sync::mpsc::Sender<()>,
    }

    impl MockServer {
        fn start<F>(handler: F) -> Self
        where
            F: Fn(&str, &[u8]) -> (u16, Vec<(&'static str, &'static str)>, Vec<u8>)
                + Send
                + Sync
                + 'static,
        {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
            let port = listener.local_addr().unwrap().port();
            let (tx, rx) = std::sync::mpsc::channel();
            let handler = std::sync::Arc::new(handler);

            thread::spawn(move || {
                let _ = listener.set_nonblocking(true);
                while rx.try_recv().is_err() {
                    if let Ok((mut stream, _)) = listener.accept() {
                        let h = handler.clone();
                        thread::spawn(move || {
                            let mut buf = Vec::with_capacity(4096);
                            let mut temp = [0u8; 2048];
                            let _ = stream
                                .set_read_timeout(Some(std::time::Duration::from_millis(150)));
                            while let Ok(n) = stream.read(&mut temp) {
                                if n == 0 {
                                    break;
                                }
                                buf.extend_from_slice(&temp[..n]);
                                if n < temp.len() {
                                    break;
                                }
                            }
                            let req_text = String::from_utf8_lossy(&buf).to_string();
                            let (status, headers, body) = h(&req_text, &buf);
                            let mut resp = format!(
                                "HTTP/1.1 {status} OK\r\nContent-Length: {}\r\nConnection: close\r\n",
                                body.len()
                            );
                            for (k, v) in headers {
                                resp.push_str(&format!("{k}: {v}\r\n"));
                            }
                            resp.push_str("\r\n");
                            let _ = stream.write_all(resp.as_bytes());
                            let _ = stream.write_all(&body);
                            let _ = stream.flush();
                        });
                    }
                    thread::sleep(std::time::Duration::from_millis(5));
                }
            });

            MockServer { port, shutdown: tx }
        }

        fn url(&self, path: &str) -> String {
            format!("http://127.0.0.1:{}{}", self.port, path)
        }
    }

    impl Drop for MockServer {
        fn drop(&mut self) {
            let _ = self.shutdown.send(());
        }
    }

    /// Run an async body on a throwaway multi-thread runtime (avoids needing
    /// tokio's `macros` feature / `#[tokio::test]`).
    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(f)
    }

    fn req(method: &str, url: &str) -> HttpRequest {
        HttpRequest {
            method: method.to_string(),
            url: url.to_string(),
            params: vec![],
            headers: vec![],
            body_mode: "none".to_string(),
            body: String::new(),
            form_fields: vec![],
            multipart: vec![],
            binary_path: String::new(),
            auth: RequestAuth::default(),
            danger_accept_invalid_certs: false,
            timeout_ms: None,
            pre_request_script: None,
            test_script: None,
        }
    }

    #[test]
    fn performs_a_real_get() {
        let server = MockServer::start(|_req, _| {
            (
                200,
                vec![("Content-Type", "text/plain")],
                b"Mock Server Response".to_vec(),
            )
        });
        let res =
            block_on(execute(req("GET", &server.url("/")), None, None)).expect("request succeeds");
        assert_eq!(res.status, 200);
        assert!(res.size_bytes > 0);
        assert!(res.body.contains("Mock Server Response"));
    }

    #[test]
    fn appends_query_params() {
        let server = MockServer::start(|req, _| {
            (
                200,
                vec![("Content-Type", "application/json")],
                format!("{{\"echo\": {:?}}}", req).into_bytes(),
            )
        });
        let mut r = req("GET", &server.url("/get"));
        r.params.push(KeyValue {
            key: "hello".to_string(),
            value: "world".to_string(),
            enabled: true,
        });
        let res = block_on(execute(r, None, None)).expect("request succeeds");
        assert_eq!(res.status, 200);
        assert!(res.body.contains("hello=world"));
    }

    #[test]
    fn sends_urlencoded_form() {
        let server = MockServer::start(|req, _| {
            (
                200,
                vec![("Content-Type", "application/json")],
                format!("{{\"echo\": {:?}}}", req).into_bytes(),
            )
        });
        let mut r = req("POST", &server.url("/post"));
        r.body_mode = "form".to_string();
        r.form_fields.push(KeyValue {
            key: "greeting".to_string(),
            value: "hello world".to_string(),
            enabled: true,
        });
        r.form_fields.push(KeyValue {
            key: "skip".to_string(),
            value: "nope".to_string(),
            enabled: false,
        });
        let res = block_on(execute(r, None, None)).expect("request succeeds");
        assert_eq!(res.status, 200);
        assert!(res.body.contains("greeting=hello+world"));
        assert!(res.body.contains("application/x-www-form-urlencoded"));
        assert!(!res.body.contains("skip"), "disabled rows are omitted");
    }

    #[test]
    fn uploads_a_binary_body_from_a_path() {
        let server = MockServer::start(|req, body| {
            (
                200,
                vec![("Content-Type", "application/json")],
                format!(
                    "{{\"body\": {:?}, \"header\": {:?}}}",
                    String::from_utf8_lossy(body),
                    req
                )
                .into_bytes(),
            )
        });
        let path = std::env::temp_dir().join("restio_binary_upload.txt");
        std::fs::write(&path, b"binary-body-contents").expect("write temp file");
        let mut r = req("POST", &server.url("/post"));
        r.body_mode = "binary".to_string();
        r.binary_path = path.to_string_lossy().into_owned();
        let res = block_on(execute(r, None, None)).expect("request succeeds");
        assert_eq!(res.status, 200);
        assert!(res.body.contains("binary-body-contents"));
        assert!(res.body.contains("application/octet-stream"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn uploads_multipart_text_and_file() {
        use crate::models::MultipartField;
        let server = MockServer::start(|req, _| {
            (
                200,
                vec![("Content-Type", "application/json")],
                format!("{{\"echo\": {:?}}}", req).into_bytes(),
            )
        });
        let path = std::env::temp_dir().join("restio_multipart_upload.txt");
        std::fs::write(&path, b"file-part-contents").expect("write temp file");
        let mut r = req("POST", &server.url("/post"));
        r.body_mode = "multipart".to_string();
        r.multipart.push(MultipartField {
            key: "field".to_string(),
            kind: "text".to_string(),
            value: "text-part".to_string(),
            file_path: String::new(),
            enabled: true,
        });
        r.multipart.push(MultipartField {
            key: "upload".to_string(),
            kind: "file".to_string(),
            value: String::new(),
            file_path: path.to_string_lossy().into_owned(),
            enabled: true,
        });
        let res = block_on(execute(r, None, None)).expect("request succeeds");
        assert_eq!(res.status, 200);
        assert!(res.body.contains("text-part"));
        assert!(res.body.contains("restio_multipart_upload.txt"));
        assert!(res.body.contains("file-part-contents"));
        assert!(res.body.contains("multipart/form-data"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn applies_bearer_and_basic_and_apikey_auth() {
        use crate::models::{ApiKeyAuth, BasicAuth, BearerAuth};
        let server = MockServer::start(|req, _| {
            (
                200,
                vec![("Content-Type", "application/json")],
                format!("{{\"request\": {:?}}}", req).into_bytes(),
            )
        });

        // Bearer → Authorization: Bearer <token>.
        let mut r = req("GET", &server.url("/get"));
        r.auth.auth_type = "bearer".to_string();
        r.auth.bearer = BearerAuth {
            token: "TKN123".to_string(),
        };
        let res = block_on(execute(r, None, None)).expect("succeeds");
        assert!(res.body.contains("Bearer TKN123"));

        // Basic → Authorization: Basic base64(user:pass). base64("user:pass").
        let mut r = req("GET", &server.url("/get"));
        r.auth.auth_type = "basic".to_string();
        r.auth.basic = BasicAuth {
            username: "user".to_string(),
            password: "pass".to_string(),
        };
        let res = block_on(execute(r, None, None)).expect("succeeds");
        assert!(res.body.contains("Basic dXNlcjpwYXNz"));

        // API key in header.
        let mut r = req("GET", &server.url("/get"));
        r.auth.auth_type = "apikey".to_string();
        r.auth.api_key = ApiKeyAuth {
            key: "X-Api-Key".to_string(),
            value: "s3cret".to_string(),
            add_to: "header".to_string(),
        };
        let res = block_on(execute(r, None, None)).expect("succeeds");
        assert!(res.body.contains("X-Api-Key: s3cret") || res.body.contains("x-api-key: s3cret"));

        // API key in query.
        let mut r = req("GET", &server.url("/get"));
        r.auth.auth_type = "apikey".to_string();
        r.auth.api_key = ApiKeyAuth {
            key: "api_key".to_string(),
            value: "qval".to_string(),
            add_to: "query".to_string(),
        };
        let res = block_on(execute(r, None, None)).expect("succeeds");
        assert!(res.body.contains("api_key=qval"));
    }

    #[test]
    fn rejects_a_bad_url() {
        let err = block_on(execute(req("GET", "not a url"), None, None)).unwrap_err();
        assert!(matches!(err, AppError::InvalidUrl(_)));
    }

    #[test]
    fn returns_binary_as_base64() {
        let binary_payload = vec![137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13];
        let payload_clone = binary_payload.clone();
        let server = MockServer::start(move |_, _| {
            (
                200,
                vec![("Content-Type", "image/png")],
                payload_clone.clone(),
            )
        });
        let res =
            block_on(execute(req("GET", &server.url("/image.png")), None, None)).expect("succeeds");
        assert_eq!(res.status, 200);
        assert_eq!(res.body_encoding, "base64");
        assert_eq!(res.size_bytes, binary_payload.len() as u64);
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&res.body)
            .expect("body is valid base64");
        assert_eq!(
            decoded, binary_payload,
            "decoded bytes match original binary"
        );
    }

    #[test]
    fn aborting_cancels_an_in_flight_request() {
        let server = MockServer::start(|_, _| {
            std::thread::sleep(std::time::Duration::from_secs(3));
            (200, vec![], b"done".to_vec())
        });
        block_on(async {
            let task = tokio::spawn(async move {
                execute(req("GET", &server.url("/delay")), None, None).await
            });
            let abort = task.abort_handle();
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            abort.abort();
            let joined = task.await;
            assert!(joined.is_err(), "task should not have completed");
            assert!(
                joined.unwrap_err().is_cancelled(),
                "join error should be cancellation"
            );
        });
    }

    #[test]
    fn offloads_large_response_to_file() {
        let server = MockServer::start(|_, _| {
            let large = vec![b'A'; 6 * 1024 * 1024];
            (
                200,
                vec![("Content-Type", "application/octet-stream")],
                large,
            )
        });
        let res =
            block_on(execute(req("GET", &server.url("/large")), None, None)).expect("succeeds");
        assert_eq!(res.status, 200);
        assert_eq!(res.body_encoding, "file");
        assert_eq!(res.size_bytes, 6 * 1024 * 1024);
        assert!(res.body.is_empty(), "body string in memory should be empty");
        assert!(res.saved_path.is_some(), "saved_path should be populated");
        let path = std::path::PathBuf::from(res.saved_path.unwrap());
        assert!(path.exists());
        let meta = std::fs::metadata(&path).unwrap();
        assert_eq!(meta.len(), 6 * 1024 * 1024);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    #[ignore = "hits badssl.com for external TLS cert check; run with `cargo test -- --ignored`"]
    fn allows_self_signed_cert_when_danger_flag_enabled() {
        let mut r = req("GET", "https://self-signed.badssl.com/");
        r.danger_accept_invalid_certs = true;
        let res = block_on(execute(r, None, None));
        assert!(
            res.is_ok(),
            "Request with invalid cert allowed should succeed: {:?}",
            res.err()
        );
    }
}
