#!/usr/bin/env node

/**
 * 测试 Banana 2 Pro 4K API
 * 直接调用 Dify API 查看响应
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取 .env.local 文件
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    envVars[key] = value;
  }
});

const DIFY_BASE_URL = envVars.DIFY_BASE_URL || "http://43.154.111.156/v1";
const DIFY_BANANA_API_KEY = envVars.DIFY_BANANA_API_KEY;

console.log('🎨 [Banana API 测试]\n');
console.log('配置信息:');
console.log(`  - Base URL: ${DIFY_BASE_URL}`);
console.log(`  - API Key: ${DIFY_BANANA_API_KEY}`);
console.log('');

if (!DIFY_BANANA_API_KEY) {
  console.error('❌ 错误: DIFY_BANANA_API_KEY 未配置');
  process.exit(1);
}

async function testBananaAPI() {
  const testQuery = "生成一张可爱的小猫图片";
  
  console.log(`📤 发送测试请求: "${testQuery}"`);
  console.log('');
  
  try {
    const response = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DIFY_BANANA_API_KEY}`
      },
      body: JSON.stringify({
        inputs: {},
        query: testQuery,
        response_mode: 'streaming',
        user: 'test-user-123'
      })
    });
    
    console.log(`📡 响应状态: ${response.status} ${response.statusText}`);
    console.log('');
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API 错误响应:');
      console.error(errorText);
      return;
    }
    
    console.log('✅ API 调用成功，开始接收流式数据...\n');
    console.log('─'.repeat(60));
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          console.log('\n✅ 流式传输完成');
          continue;
        }
        
        try {
          const json = JSON.parse(data);
          eventCount++;
          
          console.log(`\n📦 事件 #${eventCount}: ${json.event}`);
          
          if (json.event === 'message' && json.answer) {
            console.log(`   内容: ${json.answer.substring(0, 100)}${json.answer.length > 100 ? '...' : ''}`);
          }
          
          if (json.event === 'message_file') {
            console.log(`   文件类型: ${json.type}`);
            console.log(`   文件URL: ${json.url}`);
          }
          
          if (json.event === 'workflow_finished') {
            console.log(`   工作流完成`);
            if (json.outputs) {
              console.log(`   输出:`, JSON.stringify(json.outputs).substring(0, 200));
            }
          }
          
          if (json.event === 'message_end') {
            console.log(`   消息结束`);
            if (json.metadata?.usage) {
              console.log(`   Token使用: ${json.metadata.usage.total_tokens}`);
            }
          }
          
          if (json.event === 'error') {
            console.error(`   ❌ 错误: ${json.message || JSON.stringify(json)}`);
          }
          
        } catch (e) {
          console.error(`   ⚠️ 解析失败: ${data.substring(0, 100)}`);
        }
      }
    }
    
    console.log('\n' + '─'.repeat(60));
    console.log(`\n✅ 测试完成，共收到 ${eventCount} 个事件`);
    
  } catch (error) {
    console.error('\n❌ 测试失败:');
    console.error(error);
  }
}

testBananaAPI();
