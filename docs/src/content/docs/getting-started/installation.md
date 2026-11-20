---
title: Installation
description: How to install and run RestIO on macOS, Windows, and Linux.
---

# Installing RestIO

RestIO is distributed as a lightweight, native cross-platform desktop application powered by **Tauri v2**.

---

## System Requirements

| OS          | Supported Architectures                     | Minimum Version                                   |
| :---------- | :------------------------------------------ | :------------------------------------------------ |
| **macOS**   | Apple Silicon (`aarch64`), Intel (`x86_64`) | macOS 11 (Big Sur) or newer                       |
| **Linux**   | 64-bit (`x86_64`), ARM64 (`aarch64`)        | Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux |
| **Windows** | 64-bit (`x64`)                              | Windows 10 (1809+) or Windows 11 with WebView2    |

---

## Binary Downloads

Pre-built binaries for every release are available on the [RestIO GitHub Releases](https://github.com/ibishek/restio/releases) page.

### macOS

Download the appropriate package for your Mac architecture:

- Apple Silicon (M1/M2/M3/M4): `restio_x.x.x_aarch64.dmg`
- Intel: `restio_x.x.x_x64.dmg`

Drag `RestIO.app` into your `/Applications` directory.

### Linux

Download your preferred package format:

- **Debian / Ubuntu**: `restio_x.x.x_amd64.deb`
  ```bash
  sudo dpkg -i restio_*.deb
  ```
- **AppImage** (universal): `restio_x.x.x_amd64.AppImage`
  ```bash
  chmod +x restio_*.AppImage
  ./restio_*.AppImage
  ```

### Windows

Download the Windows installer:

- `restio_x.x.x_x64-setup.exe` or `restio_x.x.x_x64_en-US.msi`

Run the installer and follow the setup wizard. _(Windows requires Microsoft Edge WebView2, which is pre-installed on Windows 10 and 11.)_

---

## Building from Source

If you prefer building RestIO directly from the repository:

### 1. Prerequisites

Ensure you have the following installed on your machine:

- **Node.js**: `v24.16.0` or newer (pinned in `.nvmrc`)
- **Package Manager**: [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- **Rust**: Toolchain `edition 2021` via [rustup.rs](https://rustup.rs/)
- **Platform Dependencies**:
  - **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio C++ Build Tools & WebView2

### 2. Clone and Install Dependencies

```bash
git clone https://github.com/ibishek/restio.git
cd restio

# Install frontend and build dependencies
pnpm install
```

### 3. Run in Development Mode

Launch the native desktop shell with hot reloading enabled for the SvelteKit frontend:

```bash
pnpm tauri dev
```

> **Note:** The first run will download and compile Rust crates (`reqwest`, `rusqlite`, `tauri`, etc.), which takes 1-3 minutes. Subsequent compilations are cached and nearly instant.

### 4. Build Production Binaries

To build optimized, platform-native binaries:

```bash
pnpm tauri build
```

The output bundles will be located in `src-tauri/target/release/bundle/`.
