//! Apply request authorization schemes to an outbound request (ARCHITECTURE.md
//! §6). Bearer/Basic/API-key-in-header attach to the `RequestBuilder`; the
//! API-key-in-query variant contributes a query pair (applied while the URL is
//! built, in `executor`). `{{vars}}` are already resolved by the frontend
//! before this runs, so the config here is concrete.

use reqwest::RequestBuilder;

use crate::models::RequestAuth;

/// Attach header/credential-based auth (Bearer, Basic, API-key-in-header). The
/// query-param variant is handled by [`query_pair`] instead.
pub fn apply(builder: RequestBuilder, auth: &RequestAuth) -> RequestBuilder {
    match auth.auth_type.as_str() {
        "bearer" if !auth.bearer.token.is_empty() => builder.bearer_auth(&auth.bearer.token),
        "basic" => builder.basic_auth(&auth.basic.username, Some(&auth.basic.password)),
        "apikey" if auth.api_key.add_to != "query" && !auth.api_key.key.is_empty() => {
            // A malformed header name/value surfaces as a request error at send.
            builder.header(auth.api_key.key.as_str(), auth.api_key.value.as_str())
        }
        _ => builder,
    }
}

/// The `(key, value)` to append to the URL query when using API-key-in-query
/// auth, or `None` for any other scheme.
pub fn query_pair(auth: &RequestAuth) -> Option<(&str, &str)> {
    if auth.auth_type == "apikey" && auth.api_key.add_to == "query" && !auth.api_key.key.is_empty()
    {
        Some((auth.api_key.key.as_str(), auth.api_key.value.as_str()))
    } else {
        None
    }
}
