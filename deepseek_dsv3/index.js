const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// 添加请求体大小限制
router.use(express.json({ limit: '10mb' }));

// 创建日志目录
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 日志记录函数
const logMessage = (type, content) => {
    const timestamp = new Date().toISOString();
    const logFile = path.join(logDir, `${timestamp.split('T')[0]}.log`);
    const logEntry = `[${timestamp}] ${type}: ${JSON.stringify(content)}\n`;
    
    fs.appendFileSync(logFile, logEntry);
};

router.post('/', async (req, res) => {
    console.log('GPT Proxy, DEEPSEEK-DSV3 being used');
    const { api_key, messages } = req.body;
    
    // 记录输入消息
    logMessage('INPUT', {
        messages: messages,
        timestamp: new Date().toISOString()
    });
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const getCurrentTimestamp = () => new Date().toISOString();
    let fullResponse = '';

    try {
        // 验证请求参数
        if (!api_key && !process.env.SILICONFLOW_KEY) {
            throw {
                error: {
                    message: "API key is required",
                    type: 'invalid_request_error',
                    param: 'api_key',
                    code: 'missing_api_key'
                }
            };
        }

        if (!Array.isArray(messages)) {
            throw {
                error: {
                    message: "Invalid type for 'messages': expected an array of objects, but got something else.",
                    type: 'invalid_request_error',
                    param: 'messages',
                    code: 'invalid_type'
                }
            };
        }

        // 验证消息格式
        for (const msg of messages) {
            if (!msg.role || !msg.content) {
                throw {
                    error: {
                        message: "Each message must have 'role' and 'content' fields",
                        type: 'invalid_request_error',
                        param: 'messages',
                        code: 'invalid_message_format'
                    }
                };
            }
        }
        // We're using SiliconFlow to generate the response
        // 创建 axios 请求配置
        const config = {
            method: 'post',
            url: 'https://api.siliconflow.cn/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${api_key || process.env.SILICONFLOW_KEY}`
            },
            data: {
                model: "deepseek-ai/DeepSeek-V3",
                messages: messages,
                stream: true
            },
            responseType: 'stream',
            timeout: 30000
        };

        // 发送请求并处理流式响应
        const response = await axios(config);
        
        // 处理流式响应
        response.data.on('data', chunk => {
            try {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            // 记录完整响应
                            logMessage('OUTPUT', {
                                messages: messages,
                                response: fullResponse,
                                timestamp: new Date().toISOString()
                            });
                            res.end();
                            return;
                        }
                        const parsed = JSON.parse(data);
                        if (parsed.choices[0]?.delta?.content) {
                            const content = parsed.choices[0].delta.content;
                            fullResponse += content;
                            res.write(content);
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing chunk:', error);
                logMessage('ERROR', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        response.data.on('end', () => {
            res.end();
        });

        response.data.on('error', (error) => {
            console.error('Stream error:', error);
            logMessage('ERROR', {
                error: error.message,
                type: 'stream_error',
                timestamp: new Date().toISOString()
            });
            res.status(500).json({
                error: {
                    message: 'Stream processing error',
                    type: 'stream_error',
                    code: 'stream_processing_failed'
                },
                timestamp: getCurrentTimestamp()
            });
        });

    } catch (error) {
        const timestamp = getCurrentTimestamp();
        console.error(`[${timestamp}] Error from DeepSeek API:`, error);
        
        // 记录错误
        logMessage('ERROR', {
            error: error.message,
            type: error?.error?.type || 'unknown_error',
            timestamp: new Date().toISOString()
        });

        // 根据错误类型设置不同的状态码
        const statusCode = error?.error?.code === 'missing_api_key' ? 401 :
                          error?.error?.code === 'invalid_type' ? 400 : 500;

        res.status(statusCode).json({
            error: {
                message: error?.error?.message || error.message || 'An error occurred',
                type: error?.error?.type || 'unknown_error',
                param: error?.error?.param || null,
                code: error?.error?.code || 'unknown_code'
            },
            timestamp: timestamp
        });
    }
});

module.exports = router;