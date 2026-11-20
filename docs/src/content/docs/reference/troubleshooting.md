---
title: Troubleshooting & FAQ
description: Solutions for self-signed certificates, localhost networking, OS dependencies, and common errors.
---

# Troubleshooting & FAQ

Common questions and troubleshooting steps when using or building RestIO.

---

## 1. SSL / TLS Certificate Errors

### Problem: `invalid peer certificate: UnknownIssuer`

When connecting to local microservices (`https://localhost:8443`) or internal staging servers using self-signed certificates, the request fails with a certificate verification error.

### Solution:

1. Open the request in the workbench.
2. Click the **Settings** tab.
3. Toggle on **Dangerously Accept Invalid Certs**.
4. Send the request again. The Rust HTTP engine will bypass certificate authority verification for this endpoint.

---

## 2. Localhost & Docker Container Connectivity

### Calling APIs running in Docker

If your API backend is running inside Docker on Linux or macOS:

- If running with `-p 8080:8080`, connect to `http://localhost:8080`.
- On Linux, if using container networking, you can also use `http://172.17.0.1:8080`.

### Calling APIs from WSL2 (Windows)

When running RestIO on Windows and your backend is inside WSL2:

- Windows WebView2 communicates with WSL2 via `localhost:PORT` or `http://<WSL_IP>:PORT`.
- Ensure your server inside WSL2 binds to `0.0.0.0`, not strictly `127.0.0.1`.

---

## 3. Platform Dependencies

### Linux: Missing WebKitGTK

If running `pnpm tauri dev` or launching the `.deb`/AppImage on Linux fails with:
`error: Package 'webkit2gtk-4.1' not found`

Install the required system libraries:

```bash
# Ubuntu / Debian:
sudo apt-get update && sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# Fedora:
sudo dnf install webkit2gtk4.1-devel openssl-devel
```

### Windows: Missing WebView2

On Windows 10/11, RestIO requires Microsoft Edge WebView2.

- Windows 11 and recent Windows 10 updates include WebView2 by default.
- If missing, download the **Evergreen Bootstrapper** from [Microsoft WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

---

## 4. Frequent Questions

### Is RestIO completely offline?

**Yes.** RestIO never transmits your requests, tokens, or collections to any proprietary cloud servers. All executions run locally on your machine via Rust.

### Can I run tests in CI/CD pipelines?

A standalone headless CLI test runner (`restio run`) is currently in active development on the [Product Roadmap](/reference/roadmap/). You can also export collections to Postman format and run them with `newman`.
