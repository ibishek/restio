//! HTTP Cookie parsing, RFC 6265 domain/path matching, and header serialization.

use std::time::{SystemTime, UNIX_EPOCH};
use url::Url;

use crate::models::Cookie;

/// Current Unix timestamp in seconds.
pub fn now_sec() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Parse a `Set-Cookie` header value into a `Cookie` struct and an `is_expired` flag.
/// Returns `None` if the header cannot be parsed into a valid cookie name/value.
pub fn parse_set_cookie(
    header_val: &str,
    req_url: &Url,
    workspace_id: &str,
) -> Option<(Cookie, bool)> {
    let parsed = cookie::Cookie::parse(header_val).ok()?;
    let name = parsed.name().trim();
    if name.is_empty() {
        return None;
    }
    let value = parsed.value().to_string();

    let req_host = req_url.host_str().unwrap_or("localhost");
    let domain = match parsed.domain() {
        Some(d) => d.trim().trim_start_matches('.').to_lowercase(),
        None => req_host.to_lowercase(),
    };

    let path = match parsed.path() {
        Some(p) if !p.is_empty() => p.to_string(),
        _ => "/".to_string(),
    };

    let http_only = parsed.http_only().unwrap_or(false);
    let secure = parsed.secure().unwrap_or(false);
    let same_site = match parsed.same_site() {
        Some(cookie::SameSite::Strict) => "Strict".to_string(),
        Some(cookie::SameSite::Lax) => "Lax".to_string(),
        Some(cookie::SameSite::None) => "None".to_string(),
        None => "".to_string(),
    };

    let max_age_secs = parsed.max_age().map(|d| d.whole_seconds());

    let current_sec = now_sec();
    let mut is_expired = false;

    // Check Max-Age <= 0
    if let Some(ma) = max_age_secs {
        if ma <= 0 {
            is_expired = true;
        }
    }

    let expires = match parsed.expires() {
        Some(cookie::Expiration::DateTime(dt)) => {
            let exp_sec = dt.unix_timestamp();
            if exp_sec <= current_sec {
                is_expired = true;
            }
            Some(exp_sec)
        }
        Some(cookie::Expiration::Session) => None,
        None => {
            // If Max-Age is present but not Expires, calculate expires from max_age
            max_age_secs.map(|ma| current_sec + ma)
        }
    };

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let id = format!("ck-{nanos}");

    let cookie = Cookie {
        id,
        workspace_id: workspace_id.to_string(),
        domain,
        path,
        name: name.to_string(),
        value,
        http_only,
        secure,
        same_site,
        expires,
        max_age: max_age_secs,
        created_at: current_sec,
    };

    Some((cookie, is_expired))
}

/// Determine whether a cookie matches the given request per RFC 6265 rules.
pub fn matches_request(
    cookie: &Cookie,
    req_host: &str,
    req_path: &str,
    is_secure: bool,
    current_time: i64,
) -> bool {
    // 1. Expiration check
    if let Some(exp) = cookie.expires {
        if exp < current_time {
            return false;
        }
    }

    // 2. Domain matching (RFC 6265 §5.1.3)
    let host = req_host.to_lowercase();
    let cookie_domain = cookie.domain.to_lowercase();

    let domain_matches = if host == cookie_domain {
        true
    } else if host.ends_with(&format!(".{cookie_domain}")) {
        // Subdomain matches parent domain (e.g. api.example.com matches example.com)
        // IP addresses should not match subdomains
        !host.chars().all(|c| c.is_ascii_digit() || c == '.')
    } else {
        false
    };

    if !domain_matches {
        return false;
    }

    // 3. Path matching (RFC 6265 §5.1.4)
    let req_path = if req_path.is_empty() { "/" } else { req_path };
    let cookie_path = if cookie.path.is_empty() {
        "/"
    } else {
        &cookie.path
    };

    let path_matches = if req_path == cookie_path || cookie_path == "/" {
        true
    } else if req_path.starts_with(cookie_path) {
        cookie_path.ends_with('/') || req_path.as_bytes().get(cookie_path.len()) == Some(&b'/')
    } else {
        false
    };

    if !path_matches {
        return false;
    }

    // 4. Secure attribute
    if cookie.secure && !is_secure && host != "localhost" && host != "127.0.0.1" {
        return false;
    }

    true
}

/// Format matching cookies into a single `Cookie: name=value; name2=value2` header string.
pub fn build_cookie_header(cookies: &[Cookie]) -> String {
    cookies
        .iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ")
}

/// Generate candidate cookie domains for a request host according to RFC 6265.
/// E.g., "api.staging.example.com" -> ["api.staging.example.com", "staging.example.com", "example.com"].
/// IP addresses and localhost return only themselves.
pub fn candidate_domains(host: &str) -> Vec<String> {
    let host = host.trim().trim_start_matches('.').to_lowercase();
    if host.is_empty() {
        return Vec::new();
    }
    if host == "localhost"
        || host
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == ':')
    {
        return vec![host];
    }

    let mut candidates = Vec::new();
    let parts: Vec<&str> = host.split('.').collect();
    let max_splits = parts.len().saturating_sub(1);
    for i in 0..max_splits {
        candidates.push(parts[i..].join("."));
    }
    if candidates.is_empty() {
        candidates.push(host);
    }
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_set_cookie() {
        let url = Url::parse("https://api.example.com/v1/auth").unwrap();
        let header = "session_id=secret123; Domain=example.com; Path=/v1; HttpOnly; Secure; SameSite=Lax; Max-Age=3600";
        let (cookie, is_expired) = parse_set_cookie(header, &url, "ws-1").expect("should parse");

        assert!(!is_expired);
        assert_eq!(cookie.name, "session_id");
        assert_eq!(cookie.value, "secret123");
        assert_eq!(cookie.domain, "example.com");
        assert_eq!(cookie.path, "/v1");
        assert!(cookie.http_only);
        assert!(cookie.secure);
        assert_eq!(cookie.same_site, "Lax");
        assert_eq!(cookie.max_age, Some(3600));
        assert!(cookie.expires.is_some());
    }

    #[test]
    fn parses_immediate_expiry_cookie() {
        let url = Url::parse("https://api.example.com/logout").unwrap();
        let header = "session_id=; Max-Age=0; Path=/";
        let (cookie, is_expired) = parse_set_cookie(header, &url, "ws-1").expect("should parse");

        assert!(is_expired);
        assert_eq!(cookie.name, "session_id");
        assert_eq!(cookie.value, "");
    }

    #[test]
    fn domain_and_path_matching() {
        let c = Cookie {
            id: "1".into(),
            workspace_id: "ws-1".into(),
            domain: "example.com".into(),
            path: "/v1".into(),
            name: "tok".into(),
            value: "abc".into(),
            http_only: true,
            secure: true,
            same_site: "Lax".into(),
            expires: None,
            max_age: None,
            created_at: 1000,
        };

        // Same host, same path, secure
        assert!(matches_request(&c, "example.com", "/v1/users", true, 2000));
        // Subdomain matches
        assert!(matches_request(
            &c,
            "api.example.com",
            "/v1/users",
            true,
            2000
        ));
        // Different domain fails
        assert!(!matches_request(&c, "other.com", "/v1/users", true, 2000));
        // Different path prefix fails
        assert!(!matches_request(&c, "example.com", "/v2/users", true, 2000));
        // Insecure fails for secure cookie
        assert!(!matches_request(
            &c,
            "example.com",
            "/v1/users",
            false,
            2000
        ));
    }

    #[test]
    fn formats_cookie_header() {
        let c1 = Cookie {
            id: "1".into(),
            workspace_id: "ws-1".into(),
            domain: "example.com".into(),
            path: "/".into(),
            name: "a".into(),
            value: "1".into(),
            http_only: false,
            secure: false,
            same_site: "".into(),
            expires: None,
            max_age: None,
            created_at: 1000,
        };
        let c2 = Cookie {
            id: "2".into(),
            workspace_id: "ws-1".into(),
            domain: "example.com".into(),
            path: "/".into(),
            name: "b".into(),
            value: "2".into(),
            http_only: false,
            secure: false,
            same_site: "".into(),
            expires: None,
            max_age: None,
            created_at: 1000,
        };

        let hdr = build_cookie_header(&[c1, c2]);
        assert_eq!(hdr, "a=1; b=2");
    }

    #[test]
    fn extracts_candidate_domains() {
        assert_eq!(
            candidate_domains("api.sub.example.com"),
            vec![
                "api.sub.example.com".to_string(),
                "sub.example.com".to_string(),
                "example.com".to_string()
            ]
        );
        assert_eq!(
            candidate_domains("localhost"),
            vec!["localhost".to_string()]
        );
        assert_eq!(
            candidate_domains("127.0.0.1"),
            vec!["127.0.0.1".to_string()]
        );
    }
}
