fn main() {
    #[cfg(feature = "napi_binding")]
    napi_build::setup();
}
