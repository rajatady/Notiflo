#![cfg(feature = "integration-tests")]

use redis::AsyncCommands;
use shared_types::DeliveryResult;

use super::common;

const TEST_STREAM_KEY: &str = "notiflo:events:delivery";

fn make_delivery_result() -> DeliveryResult {
    DeliveryResult {
        request_id: "req-test-001".to_string(),
        condition_match_id: "match-test-001".to_string(),
        organization_id: "org-test-123".to_string(),
        subscriber_id: "sub-test-456".to_string(),
        channel: "email".to_string(),
        provider: "sendgrid".to_string(),
        success: true,
        message_id: Some("msg-abc-123".to_string()),
        error: None,
        latency_us: 12345,
        timestamp_us: 1700000000000000,
    }
}

#[tokio::test]
async fn test_event_log_write_and_read_back() {
    let redis_url = std::env::var("NOTIFLO_REDIS_URL")
        .unwrap_or_else(|_| "redis://localhost:6379".to_string());

    // Clean up the stream before the test
    let mut conn = common::redis_test_conn().await;
    let _: redis::RedisResult<()> = redis::cmd("DEL")
        .arg(TEST_STREAM_KEY)
        .query_async(&mut conn)
        .await;

    // Create EventLog and ensure consumer group
    let event_log = notiflo_runtime_lib::event_log::EventLog::new(&redis_url)
        .await
        .expect("Failed to create EventLog");
    event_log
        .ensure_consumer_group()
        .await
        .expect("Failed to ensure consumer group");

    // Log a delivery result
    let result = make_delivery_result();
    event_log
        .log_delivery(&result)
        .await
        .expect("Failed to log delivery");

    // Read back via XRANGE
    let entries: Vec<redis::streams::StreamRangeReply> = vec![redis::cmd("XRANGE")
        .arg(TEST_STREAM_KEY)
        .arg("-")
        .arg("+")
        .query_async(&mut conn)
        .await
        .expect("XRANGE failed")];

    assert!(!entries.is_empty(), "Stream should have entries");

    let range_reply: redis::streams::StreamRangeReply = redis::cmd("XRANGE")
        .arg(TEST_STREAM_KEY)
        .arg("-")
        .arg("+")
        .query_async(&mut conn)
        .await
        .expect("XRANGE failed");

    assert!(
        !range_reply.ids.is_empty(),
        "Stream should contain at least one entry"
    );

    let entry = &range_reply.ids[0];
    let org_id: String = entry.get("organization_id").expect("Missing organization_id");
    let success: String = entry.get("success").expect("Missing success");
    let channel: String = entry.get("channel").expect("Missing channel");
    let provider: String = entry.get("provider").expect("Missing provider");
    let request_id: String = entry.get("request_id").expect("Missing request_id");

    assert_eq!(org_id, "org-test-123");
    assert_eq!(success, "true");
    assert_eq!(channel, "email");
    assert_eq!(provider, "sendgrid");
    assert_eq!(request_id, "req-test-001");

    // Clean up: delete the stream key
    let _: redis::RedisResult<()> = redis::cmd("DEL")
        .arg(TEST_STREAM_KEY)
        .query_async(&mut conn)
        .await;
}

#[tokio::test]
async fn test_event_log_failed_delivery() {
    let redis_url = std::env::var("NOTIFLO_REDIS_URL")
        .unwrap_or_else(|_| "redis://localhost:6379".to_string());

    let mut conn = common::redis_test_conn().await;
    let _: redis::RedisResult<()> = redis::cmd("DEL")
        .arg(TEST_STREAM_KEY)
        .query_async(&mut conn)
        .await;

    let event_log = notiflo_runtime_lib::event_log::EventLog::new(&redis_url)
        .await
        .expect("Failed to create EventLog");
    event_log.ensure_consumer_group().await.expect("Failed to ensure consumer group");

    let result = DeliveryResult {
        request_id: "req-fail-001".to_string(),
        condition_match_id: "match-fail-001".to_string(),
        organization_id: "org-fail".to_string(),
        subscriber_id: "sub-fail".to_string(),
        channel: "sms".to_string(),
        provider: "twilio".to_string(),
        success: false,
        message_id: None,
        error: Some("Connection timeout".to_string()),
        latency_us: 99999,
        timestamp_us: 1700000000000000,
    };

    event_log
        .log_delivery(&result)
        .await
        .expect("Failed to log failed delivery");

    let range_reply: redis::streams::StreamRangeReply = redis::cmd("XRANGE")
        .arg(TEST_STREAM_KEY)
        .arg("-")
        .arg("+")
        .query_async(&mut conn)
        .await
        .expect("XRANGE failed");

    assert!(!range_reply.ids.is_empty());

    let entry = &range_reply.ids[0];
    let success: String = entry.get("success").expect("Missing success");
    let error: String = entry.get("error").expect("Missing error");
    let channel: String = entry.get("channel").expect("Missing channel");

    assert_eq!(success, "false");
    assert_eq!(error, "Connection timeout");
    assert_eq!(channel, "sms");

    // Clean up
    let _: redis::RedisResult<()> = redis::cmd("DEL")
        .arg(TEST_STREAM_KEY)
        .query_async(&mut conn)
        .await;
}
