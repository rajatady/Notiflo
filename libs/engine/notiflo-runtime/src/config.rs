use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(name = "notiflo-runtime", about = "Notiflo real-time alerting pipeline worker")]
pub struct RuntimeConfig {
    /// MongoDB connection URI
    #[arg(long, env = "NOTIFLO_MONGODB_URI")]
    pub mongodb_uri: String,

    /// Redis connection URL
    #[arg(long, env = "NOTIFLO_REDIS_URL")]
    pub redis_url: String,

    /// Ingest source type
    #[arg(long, env = "NOTIFLO_INGEST_TYPE", default_value = "redis")]
    pub ingest_type: IngestType,

    /// Redis queue key for tick ingestion
    #[arg(long, env = "NOTIFLO_REDIS_QUEUE_KEY", default_value = "notiflo:ticks")]
    pub redis_queue_key: String,

    /// WebSocket URL for tick ingestion
    #[arg(long, env = "NOTIFLO_WS_URL")]
    pub ws_url: Option<String>,

    /// WebSocket reconnect delay in ms
    #[arg(long, env = "NOTIFLO_WS_RECONNECT_MS", default_value = "3000")]
    pub ws_reconnect_ms: u64,

    /// Config poll interval in ms
    #[arg(long, env = "NOTIFLO_CONFIG_POLL_INTERVAL_MS", default_value = "5000")]
    pub config_poll_interval_ms: u64,

    /// Health check HTTP port
    #[arg(long, env = "NOTIFLO_HEALTH_PORT", default_value = "8080")]
    pub health_port: u16,

    /// Pipeline channel buffer size
    #[arg(long, env = "NOTIFLO_BUFFER_SIZE", default_value = "65536")]
    pub buffer_size: usize,

    /// MongoDB database name
    #[arg(long, env = "NOTIFLO_DB_NAME", default_value = "notiflo")]
    pub db_name: String,
}

#[derive(Debug, Clone, clap::ValueEnum)]
pub enum IngestType {
    Redis,
    Websocket,
}
