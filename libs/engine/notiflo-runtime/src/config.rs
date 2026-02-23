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

    /// Config poll interval in ms (alert conditions)
    #[arg(long, env = "NOTIFLO_CONFIG_POLL_INTERVAL_MS", default_value = "5000")]
    pub config_poll_interval_ms: u64,

    /// Connector poll interval in ms (ingest connector changes)
    #[arg(long, env = "NOTIFLO_CONNECTOR_POLL_INTERVAL_MS", default_value = "5000")]
    pub connector_poll_interval_ms: u64,

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
