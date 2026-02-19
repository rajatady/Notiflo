#![cfg(feature = "integration-tests")]

use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use notiflo_runtime_lib::delivery::http_provider::{HttpProvider, ProviderConfig};
use shared_types::DeliveryRequest;

fn make_delivery_request(org_id: &str, channel: &str) -> DeliveryRequest {
    DeliveryRequest {
        id: "req-pipeline-001".to_string(),
        condition_match_id: "match-pipeline-001".to_string(),
        organization_id: org_id.to_string(),
        subscriber_id: "sub-pipeline-001".to_string(),
        channel: channel.to_string(),
        provider: "test-http".to_string(),
        rendered_content: serde_json::json!({
            "subject": "Test Alert",
            "body": "AAPL crossed above 150.0",
        }),
        timestamp_us: 1700000000000000,
    }
}

#[tokio::test]
async fn test_http_delivery_success() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/deliver"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "id": "msg-mock-001" })),
        )
        .expect(1)
        .mount(&mock_server)
        .await;

    let provider = HttpProvider::new();
    provider.set_config(ProviderConfig {
        organization_id: "org-http-test".to_string(),
        channel: "email".to_string(),
        provider: "test-http".to_string(),
        endpoint: format!("{}/deliver", mock_server.uri()),
        auth_header: None,
        timeout_ms: 5000,
    });

    let request = make_delivery_request("org-http-test", "email");
    let result = provider.send_with_retry(&request).await;

    assert!(result.success, "Delivery should succeed");
    assert_eq!(result.message_id.as_deref(), Some("msg-mock-001"));
    assert!(result.error.is_none());
    assert_eq!(result.organization_id, "org-http-test");
    assert_eq!(result.channel, "email");
}

#[tokio::test]
async fn test_http_delivery_no_provider_configured() {
    let provider = HttpProvider::new();

    let request = make_delivery_request("org-missing", "push");
    let result = provider.send_with_retry(&request).await;

    assert!(!result.success, "Delivery should fail when no provider configured");
    assert!(result.error.is_some());
    assert!(
        result.error.as_ref().unwrap().contains("No provider configured"),
        "Error should indicate missing provider"
    );
}

#[tokio::test]
async fn test_http_delivery_retry_on_503_then_success() {
    let mock_server = MockServer::start().await;

    // First call returns 503 (retryable), second returns 200
    Mock::given(method("POST"))
        .and(path("/deliver"))
        .respond_with(ResponseTemplate::new(503).set_body_string("Service Unavailable"))
        .expect(1)
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    Mock::given(method("POST"))
        .and(path("/deliver"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "id": "msg-retry-ok" })),
        )
        .expect(1)
        .mount(&mock_server)
        .await;

    let provider = HttpProvider::new();
    provider.set_config(ProviderConfig {
        organization_id: "org-retry-test".to_string(),
        channel: "email".to_string(),
        provider: "test-http".to_string(),
        endpoint: format!("{}/deliver", mock_server.uri()),
        auth_header: None,
        timeout_ms: 5000,
    });

    let request = make_delivery_request("org-retry-test", "email");
    let result = provider.send_with_retry(&request).await;

    assert!(result.success, "Delivery should succeed after retry");
    assert_eq!(result.message_id.as_deref(), Some("msg-retry-ok"));
}

#[tokio::test]
async fn test_http_delivery_no_retry_on_400() {
    let mock_server = MockServer::start().await;

    // 400 is not retryable — should only be called once
    Mock::given(method("POST"))
        .and(path("/deliver"))
        .respond_with(ResponseTemplate::new(400).set_body_string("Bad Request"))
        .expect(1)
        .mount(&mock_server)
        .await;

    let provider = HttpProvider::new();
    provider.set_config(ProviderConfig {
        organization_id: "org-400-test".to_string(),
        channel: "email".to_string(),
        provider: "test-http".to_string(),
        endpoint: format!("{}/deliver", mock_server.uri()),
        auth_header: None,
        timeout_ms: 5000,
    });

    let request = make_delivery_request("org-400-test", "email");
    let result = provider.send_with_retry(&request).await;

    assert!(!result.success, "Delivery should fail on 400");
    assert!(result.error.is_some());
    assert!(
        result.error.as_ref().unwrap().contains("400"),
        "Error should contain status code 400"
    );
}

#[tokio::test]
async fn test_http_delivery_with_auth_header() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/deliver"))
        .and(wiremock::matchers::header("Authorization", "Bearer test-token"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(serde_json::json!({ "id": "msg-auth-001" })),
        )
        .expect(1)
        .mount(&mock_server)
        .await;

    let provider = HttpProvider::new();
    provider.set_config(ProviderConfig {
        organization_id: "org-auth-test".to_string(),
        channel: "email".to_string(),
        provider: "test-http".to_string(),
        endpoint: format!("{}/deliver", mock_server.uri()),
        auth_header: Some("Bearer test-token".to_string()),
        timeout_ms: 5000,
    });

    let request = make_delivery_request("org-auth-test", "email");
    let result = provider.send_with_retry(&request).await;

    assert!(result.success, "Delivery with auth header should succeed");
    assert_eq!(result.message_id.as_deref(), Some("msg-auth-001"));
}
