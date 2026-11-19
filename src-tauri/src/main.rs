#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    if let Some(status) = moyue_reader_lib::run_picker_child() {
        std::process::exit(status);
    }
    moyue_reader_lib::run();
}
