use reqwest::{redirect::Policy, Client};
use serde::Deserialize;
use std::time::Duration;

const OLLAMA: &str = "http://127.0.0.1:11434";
const MODEL: &str = "qwen3-embedding:0.6b";
const DIMENSIONS: usize = 1024;
const BATCH_SIZE: usize = 8;

#[derive(Deserialize)]
struct ModelList {
    models: Vec<InstalledModel>,
}

#[derive(Deserialize)]
struct InstalledModel {
    name: String,
    digest: String,
}

#[derive(Deserialize)]
struct EmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

fn client(timeout_ms: u64) -> Result<Client, String> {
    Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|error| format!("无法连接本机 Ollama：{error}"))
}

async fn installed_digest(client: &Client) -> Result<String, String> {
    let response = client
        .get(format!("{OLLAMA}/api/tags"))
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|_| "无法连接本机 Ollama，请确认它已启动".to_string())?;
    let models = response
        .json::<ModelList>()
        .await
        .map_err(|_| "无法读取本机 Ollama 模型列表".to_string())?;
    models.models.into_iter()
        .find(|model| model.name == MODEL && !model.digest.is_empty())
        .map(|model| model.digest)
        .ok_or_else(|| format!("本机 Ollama 缺少 {MODEL}"))
}

#[tauri::command]
pub async fn knowledge_embedding_digest() -> Result<String, String> {
    installed_digest(&client(1500)?).await
}

#[tauri::command]
pub async fn knowledge_embed(
    inputs: Vec<String>,
    digest: String,
    query: bool,
) -> Result<Vec<Vec<f32>>, String> {
    if inputs.is_empty() || inputs.len() > BATCH_SIZE || (query && inputs.len() != 1)
        || inputs.iter().any(|input| input.trim().is_empty())
    {
        return Err("语义索引输入批次无效".into());
    }
    let client = client(30_000)?;
    if installed_digest(&client).await? != digest {
        return Err("语义检索模型已更新，正在等待索引重建".into());
    }
    let response = client
        .post(format!("{OLLAMA}/api/embed"))
        .json(&serde_json::json!({ "model": MODEL, "input": &inputs, "truncate": false }))
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|_| "本机 Ollama 未能生成向量".to_string())?;
    let result = response
        .json::<EmbedResponse>()
        .await
        .map_err(|_| "本机 Ollama 返回了无效向量".to_string())?;
    if result.embeddings.len() != inputs.len() || result.embeddings.iter().any(|vector| {
        vector.len() != DIMENSIONS || vector.iter().any(|value| !value.is_finite())
    }) {
        return Err("语义向量条数、维度或数值无效".into());
    }
    if installed_digest(&client).await? != digest {
        return Err("计算向量期间模型已变更".into());
    }
    Ok(result.embeddings)
}
