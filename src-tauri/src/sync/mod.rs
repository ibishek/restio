//! Cross-user collection sharing over Git (ARCHITECTURE.md §8).
//!
//! We shell out to the user's installed `git` (via `std::process`, which — like
//! `std::fs` — needs no Tauri plugin or capability). This deliberately reuses
//! the user's existing SSH keys / credential helpers, so push/pull to GitHub,
//! GitLab, etc. works without us reimplementing auth.
//!
//! Only the collections JSON file is committed. Environments (which hold the
//! secret-ish values) live in SQLite and never touch the repo, so secrets can't
//! leak into a shared collection by construction (§8).

use std::path::Path;
use std::process::Command;

use serde::Serialize;

use crate::error::AppError;
use crate::models::Member;

/// A snapshot of a collections repo's Git state, for the sharing UI.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// Absolute path of the repo working directory (parent of the collections file).
    pub path: String,
    pub is_repo: bool,
    pub branch: String,
    pub has_remote: bool,
    pub remote_url: String,
    /// Commits the local branch is ahead of its upstream.
    pub ahead: u32,
    /// Commits the local branch is behind its upstream.
    pub behind: u32,
    /// Uncommitted local changes present.
    pub dirty: bool,
    /// Subject line of the latest commit (empty on an unborn branch).
    pub last_commit: String,
    /// Unix seconds of the latest commit (0 if none).
    pub last_commit_at: i64,
}

/// What a pull did (or couldn't do). `Diverged` means the local and remote
/// branches both moved, so a fast-forward is impossible — the collections file
/// is a single JSON blob, so a line-level merge would corrupt it; the user
/// resolves at the file level instead (see [`use_remote`] / [`keep_local`]).
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PullOutcome {
    UpToDate,
    FastForwarded,
    Diverged,
}

/// Result of a pull attempt: the outcome plus the refreshed repo status.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub outcome: PullOutcome,
    pub status: GitStatus,
}

fn git_err(msg: impl Into<String>) -> AppError {
    let msg = msg.into();
    AppError::Git(if msg.is_empty() {
        "git command failed".into()
    } else {
        msg
    })
}

/// Run `git -C <dir> <args…>`, returning trimmed stdout or the stderr as an
/// error. `GIT_TERMINAL_PROMPT=0` makes auth failures error out instead of
/// hanging on an interactive prompt inside the GUI.
fn run_git(dir: &Path, args: &[&str]) -> Result<String, AppError> {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| git_err(format!("failed to run git: {e}")))?;
    if !out.status.success() {
        return Err(git_err(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Commits the local branch is (ahead, behind) its upstream. `(0, 0)` when
/// there's no upstream (the rev-list fails and is treated as "in sync").
fn ahead_behind(dir: &Path) -> (u32, u32) {
    let Ok(counts) = run_git(
        dir,
        &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
    ) else {
        return (0, 0);
    };
    // Output is "<behind>\t<ahead>".
    let mut it = counts.split_whitespace();
    let behind = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let ahead = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

/// Has the user configured a commit identity (`user.email`)?
fn has_identity(dir: &Path) -> bool {
    run_git(dir, &["config", "user.email"])
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

/// Run a git command that creates a commit, injecting a generic fallback
/// identity when the user hasn't configured `user.email` — so committing never
/// fails on a fresh machine.
fn run_git_commit(dir: &Path, args: &[&str]) -> Result<String, AppError> {
    if has_identity(dir) {
        run_git(dir, args)
    } else {
        let mut full = vec![
            "-c",
            "user.name=RestIO",
            "-c",
            "user.email=restio@localhost",
        ];
        full.extend_from_slice(args);
        run_git(dir, &full)
    }
}

/// Inspect the repo at `dir`. Never errors — a non-repo (or missing) directory
/// just comes back with `is_repo: false`.
pub fn status(dir: &Path) -> GitStatus {
    let mut s = GitStatus {
        path: dir.to_string_lossy().into_owned(),
        ..Default::default()
    };
    if run_git(dir, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return s;
    }
    s.is_repo = true;
    // symbolic-ref works even on an unborn branch (fresh repo, no commits yet).
    if let Ok(b) = run_git(dir, &["symbolic-ref", "--short", "HEAD"]) {
        s.branch = b;
    }
    if let Ok(url) = run_git(dir, &["remote", "get-url", "origin"]) {
        s.has_remote = true;
        s.remote_url = url;
    }
    if let Ok(p) = run_git(dir, &["status", "--porcelain"]) {
        s.dirty = !p.is_empty();
    }
    (s.ahead, s.behind) = ahead_behind(dir);
    if let Ok(line) = run_git(dir, &["log", "-1", "--format=%s%x1f%ct"]) {
        if let Some((subject, ts)) = line.split_once('\u{1f}') {
            s.last_commit = subject.to_string();
            s.last_commit_at = ts.parse().unwrap_or(0);
        }
    }
    s
}

/// `git init -b main` at `dir` (creating it if needed).
pub fn init(dir: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(dir).map_err(|e| git_err(e.to_string()))?;
    run_git(dir, &["init", "-b", "main"])?;
    Ok(())
}

/// `git clone <url> <dir>`.
pub fn clone(url: &str, dir: &Path) -> Result<(), AppError> {
    let trimmed = url.trim();
    if trimmed.starts_with('-') {
        return Err(git_err("Invalid git repository URL"));
    }
    if let Some(parent) = dir.parent() {
        std::fs::create_dir_all(parent).map_err(|e| git_err(e.to_string()))?;
    }
    let out = Command::new("git")
        .arg("clone")
        .arg("--")
        .arg(trimmed)
        .arg(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| git_err(format!("failed to run git: {e}")))?;
    if !out.status.success() {
        return Err(git_err(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// Point `origin` at `url` (add if absent, else update).
pub fn set_remote(dir: &Path, url: &str) -> Result<(), AppError> {
    let trimmed = url.trim();
    if trimmed.starts_with('-') {
        return Err(git_err("Invalid git remote URL"));
    }
    if run_git(dir, &["remote", "set-url", "origin", trimmed]).is_err() {
        run_git(dir, &["remote", "add", "origin", trimmed])?;
    }
    Ok(())
}

/// Stage `file_name` (relative to `dir`) and commit `message` — but only if the
/// commit would actually contain changes. Falls back to a generic identity when
/// the user hasn't configured `user.email`, so a commit never fails on a fresh
/// machine.
pub fn stage_commit(dir: &Path, file_name: &str, message: &str) -> Result<(), AppError> {
    run_git(dir, &["add", "--", file_name])?;
    // `diff --cached --quiet` exits non-zero (→ Err) when something is staged.
    if run_git(dir, &["diff", "--cached", "--quiet"]).is_ok() {
        return Ok(()); // nothing to commit
    }
    run_git_commit(dir, &["commit", "-m", message])?;
    Ok(())
}

/// Push the current branch. No-op when there's no `origin`. Sets upstream on the
/// first push.
pub fn push(dir: &Path) -> Result<(), AppError> {
    if run_git(dir, &["remote", "get-url", "origin"]).is_err() {
        return Ok(());
    }
    let has_upstream = run_git(dir, &["rev-parse", "--symbolic-full-name", "@{upstream}"]).is_ok();
    if has_upstream {
        run_git(dir, &["push"])?;
    } else {
        let branch =
            run_git(dir, &["symbolic-ref", "--short", "HEAD"]).unwrap_or_else(|_| "main".into());
        run_git(dir, &["push", "-u", "origin", &branch])?;
    }
    Ok(())
}

/// Fetch the upstream and fast-forward if possible. Reports `Diverged` (without
/// touching the working tree) when local and remote have both advanced, so the
/// caller can offer a file-level resolution. Assumes the caller has already
/// committed any pending local edits (so divergence is measured in commits).
pub fn pull(dir: &Path) -> Result<PullResult, AppError> {
    if run_git(dir, &["rev-parse", "--symbolic-full-name", "@{upstream}"]).is_err() {
        return Err(git_err("No upstream configured to pull from."));
    }
    run_git(dir, &["fetch"])?;
    let (ahead, behind) = ahead_behind(dir);
    let outcome = if behind == 0 {
        PullOutcome::UpToDate // already current (or only ahead — nothing to pull)
    } else if ahead == 0 {
        run_git(dir, &["merge", "--ff-only", "@{upstream}"])?;
        PullOutcome::FastForwarded
    } else {
        PullOutcome::Diverged // both moved — user picks a resolution
    };
    Ok(PullResult {
        outcome,
        status: status(dir),
    })
}

/// Resolve a diverged pull by discarding local commits and taking the remote
/// verbatim (`reset --hard` to the upstream). The upstream is already fetched by
/// the preceding [`pull`]; the discarded commits remain in the reflog.
pub fn use_remote(dir: &Path) -> Result<(), AppError> {
    run_git(dir, &["reset", "--hard", "@{upstream}"])?;
    Ok(())
}

/// Resolve a diverged pull by keeping the local collections and recording the
/// remote as merged (the `ours` strategy), so the local tree is unchanged and
/// the next push fast-forwards on the remote.
pub fn keep_local(dir: &Path) -> Result<(), AppError> {
    run_git_commit(
        dir,
        &[
            "merge",
            "-s",
            "ours",
            "@{upstream}",
            "-m",
            "Keep local collections over remote",
        ],
    )?;
    Ok(())
}

/// Workspace members = contributors to the collections repo, from `git
/// shortlog`. Empty when `dir` isn't a repo or has no commits yet.
pub fn members(dir: &Path) -> Vec<Member> {
    let Ok(out) = run_git(dir, &["shortlog", "-sne", "HEAD"]) else {
        return vec![];
    };
    let mut members = Vec::new();
    for line in out.lines() {
        let line = line.trim();
        // Each line is "<count>\t<name> <email>".
        let Some((count, rest)) = line.split_once('\t') else {
            continue;
        };
        let commits = count.trim().parse().unwrap_or(0);
        let (name, email) = match (rest.rfind('<'), rest.rfind('>')) {
            (Some(a), Some(b)) if b > a => {
                (rest[..a].trim().to_string(), rest[a + 1..b].to_string())
            }
            _ => (rest.trim().to_string(), String::new()),
        };
        members.push(Member {
            name,
            email,
            commits,
        });
    }
    members
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!("restio-git-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&base);
        base
    }

    #[test]
    #[ignore = "shells out to git; run with `cargo test -- --ignored`"]
    fn round_trip_init_commit_push_clone_pull() {
        // A bare repo acts as the shared "remote".
        let remote = tmp("remote.git");
        fs::create_dir_all(&remote).unwrap();
        Command::new("git")
            .args(["init", "--bare", "-b", "main"])
            .arg(&remote)
            .output()
            .unwrap();
        let remote_url = remote.to_string_lossy().to_string();

        // Working copy: init, seed a collections file, commit, wire remote, push.
        let work = tmp("work");
        init(&work).unwrap();
        fs::write(work.join("collections.json"), "[1,2,3]").unwrap();
        stage_commit(&work, "collections.json", "seed").unwrap();
        set_remote(&work, &remote_url).unwrap();
        push(&work).unwrap();

        let s = status(&work);
        assert!(s.is_repo && s.has_remote);
        assert_eq!(s.last_commit, "seed");

        // A second user clones and sees the seeded file.
        let clone_dir = tmp("clone");
        clone(&remote_url, &clone_dir).unwrap();
        assert_eq!(
            fs::read_to_string(clone_dir.join("collections.json")).unwrap(),
            "[1,2,3]"
        );

        // First user edits and publishes; second user pulls the update.
        fs::write(work.join("collections.json"), "[4,5,6]").unwrap();
        stage_commit(&work, "collections.json", "update").unwrap();
        push(&work).unwrap();
        let pulled = pull(&clone_dir).unwrap();
        assert_eq!(pulled.outcome, PullOutcome::FastForwarded);
        assert_eq!(
            fs::read_to_string(clone_dir.join("collections.json")).unwrap(),
            "[4,5,6]"
        );

        // A second pull with nothing new upstream is a no-op.
        assert_eq!(pull(&clone_dir).unwrap().outcome, PullOutcome::UpToDate);

        for d in [remote, work, clone_dir] {
            let _ = fs::remove_dir_all(d);
        }
    }

    #[test]
    #[ignore = "shells out to git; run with `cargo test -- --ignored`"]
    fn diverged_pull_resolves_by_file_choice() {
        // Shared remote + two working copies that both commit on top of it.
        let remote = tmp("d-remote.git");
        fs::create_dir_all(&remote).unwrap();
        Command::new("git")
            .args(["init", "--bare", "-b", "main"])
            .arg(&remote)
            .output()
            .unwrap();
        let remote_url = remote.to_string_lossy().to_string();

        let a = tmp("d-a");
        init(&a).unwrap();
        fs::write(a.join("collections.json"), "[0]").unwrap();
        stage_commit(&a, "collections.json", "seed").unwrap();
        set_remote(&a, &remote_url).unwrap();
        push(&a).unwrap();

        let b = tmp("d-b");
        clone(&remote_url, &b).unwrap();

        // A publishes a change; B commits a different change without pulling →
        // the two branches diverge.
        fs::write(a.join("collections.json"), "[\"remote\"]").unwrap();
        stage_commit(&a, "collections.json", "remote change").unwrap();
        push(&a).unwrap();

        fs::write(b.join("collections.json"), "[\"local\"]").unwrap();
        stage_commit(&b, "collections.json", "local change").unwrap();

        assert_eq!(pull(&b).unwrap().outcome, PullOutcome::Diverged);

        // "Keep local" leaves B's file untouched and lets its push fast-forward.
        keep_local(&b).unwrap();
        assert_eq!(
            fs::read_to_string(b.join("collections.json")).unwrap(),
            "[\"local\"]"
        );
        push(&b).unwrap();

        // Now A diverges again, then chooses "use remote": A's local change is
        // discarded in favour of what B pushed.
        fs::write(a.join("collections.json"), "[\"remote-2\"]").unwrap();
        stage_commit(&a, "collections.json", "remote change 2").unwrap();
        assert_eq!(pull(&a).unwrap().outcome, PullOutcome::Diverged);
        use_remote(&a).unwrap();
        assert_eq!(
            fs::read_to_string(a.join("collections.json")).unwrap(),
            "[\"local\"]"
        );

        for d in [remote, a, b] {
            let _ = fs::remove_dir_all(d);
        }
    }
}
