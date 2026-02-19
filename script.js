/**
 * LLM CURL GENERATOR - JavaScript
 * Converts KeyStudio format to OpenAI Chat Completion API format
 */

// ============================================
// THEME TOGGLE
// ============================================

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
    const html = document.documentElement;
    const themeIcon = document.getElementById('themeIcon');
    const currentTheme = html.getAttribute('data-theme');
    
    if (currentTheme === 'light') {
        html.removeAttribute('data-theme');
        themeIcon.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    } else {
        html.setAttribute('data-theme', 'light');
        themeIcon.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    }
}

/**
 * Initialize theme from localStorage
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeIcon = document.getElementById('themeIcon');
    
    if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (themeIcon) themeIcon.textContent = '🌙';
    } else {
        if (themeIcon) themeIcon.textContent = '☀️';
    }
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', initTheme);

/**
 * Toggle collapsible output sections
 */
function toggleCollapsible(headerElement) {
    const card = headerElement.closest('.output-card');
    card.classList.toggle('expanded');
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate JSON input and update badge
 */
function validateJSON(inputId, badgeId) {
    const input = document.getElementById(inputId);
    const badge = document.getElementById(badgeId);
    const value = input.value.trim();
    
    if (!value) {
        badge.textContent = 'Paste JSON array';
        badge.className = 'validation-badge';
        return null;
    }
    
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            badge.textContent = `✓ Valid (${parsed.length} items)`;
            badge.className = 'validation-badge valid';
            return parsed;
        } else {
            badge.textContent = '✗ Must be an array';
            badge.className = 'validation-badge invalid';
            return null;
        }
    } catch (e) {
        badge.textContent = '✗ Invalid JSON';
        badge.className = 'validation-badge invalid';
        return null;
    }
}

// Add event listeners for real-time validation
document.addEventListener('DOMContentLoaded', function() {
    const toolsInput = document.getElementById('toolsInput');
    const messagesInput = document.getElementById('messagesInput');
    
    toolsInput.addEventListener('input', () => {
        validateJSON('toolsInput', 'toolsValidation');
        // Hide error when user starts typing
        document.getElementById('errorSection').style.display = 'none';
    });
    messagesInput.addEventListener('input', () => {
        validateJSON('messagesInput', 'messagesValidation');
        // Hide error when user starts typing
        document.getElementById('errorSection').style.display = 'none';
    });
});

// ============================================
// CONVERTERS
// ============================================

/**
 * Convert tools from KeyStudio format to OpenAI format
 * 
 * KeyStudio format:
 * {
 *   "_id": "...",
 *   "name": "handoff_to_node",
 *   "description": "...",
 *   "type": "tool",                    // <-- Wrong for OpenAI
 *   "config": { "schema": {...} },     // <-- Parameters are here
 *   "alias": "actual_function_name"    // <-- Use this as function name
 * }
 * 
 * OpenAI format:
 * {
 *   "type": "function",
 *   "function": {
 *     "name": "actual_function_name",
 *     "description": "...",
 *     "parameters": {...}
 *   }
 * }
 */
function convertTools(inputTools) {
    const normalizeSchema = (schemaNode) => {
        if (!schemaNode || typeof schemaNode !== 'object') {
            return schemaNode;
        }

        const normalized = { ...schemaNode };

        if (normalized.type === 'object') {
            const props = normalized.properties && typeof normalized.properties === 'object'
                ? normalized.properties
                : {};
            const propKeys = Object.keys(props);

            // Guardrail: object schema with no properties and additionalProperties=false
            // rejects every real object payload (common source of tool schema failures).
            if (propKeys.length === 0 && normalized.additionalProperties === false) {
                normalized.additionalProperties = true;
            }

            const normalizedProps = {};
            for (const key of propKeys) {
                normalizedProps[key] = normalizeSchema(props[key]);
            }
            normalized.properties = normalizedProps;
        }

        if (normalized.type === 'array' && normalized.items) {
            normalized.items = normalizeSchema(normalized.items);
        }

        return normalized;
    };

    return inputTools.map(tool => {
        // Check if already in OpenAI format (type === "function" and has function object)
        if (tool.type === 'function' && tool.function) {
            return tool;
        }
        
        // Convert from KeyStudio format
        const functionName = tool.alias || tool.name || 'unknown_function';
        const description = tool.description || '';
        
        // Extract parameters from config.schema or use empty object
        let parameters = { type: 'object', properties: {}, required: [] };
        if (tool.config && tool.config.schema) {
            parameters = normalizeSchema(tool.config.schema);
        } else if (tool.function && tool.function.parameters) {
            parameters = normalizeSchema(tool.function.parameters);
        }
        
        return {
            type: 'function',
            function: {
                name: functionName,
                description: description,
                parameters: parameters
            }
        };
    });
}

/**
 * Build a tool-name resolver map.
 * Maps both internal tool names and aliases to the final OpenAI function name.
 */
function buildToolNameMap(inputTools) {
    const map = {};

    for (const tool of inputTools) {
        // Already OpenAI format
        if (tool.type === 'function' && tool.function && tool.function.name) {
            map[tool.function.name] = tool.function.name;
            continue;
        }

        const finalName = tool.alias || tool.name || 'unknown_function';
        if (tool.name) {
            map[tool.name] = finalName;
        }
        if (tool.alias) {
            map[tool.alias] = finalName;
        }
    }

    return map;
}

/**
 * Convert message content from KeyStudio format to OpenAI format
 * KeyStudio: content can be array [{type: "text", text: "..."}] or string
 * OpenAI: content is always a string
 */
function convertMessageContent(content) {
    // If content is already a string, return as-is
    if (typeof content === 'string') {
        return content;
    }
    
    // If content is an array (KeyStudio format)
    if (Array.isArray(content)) {
        return content
            .filter(item => item.type === 'text' && item.text)
            .map(item => item.text)
            .join('\n');
    }
    
    // If content is an object (like tool response data), stringify it
    if (content !== null && typeof content === 'object') {
        return JSON.stringify(content);
    }
    
    // Fallback
    return String(content || '');
}

/**
 * Convert messages array from KeyStudio format to OpenAI format
 * 
 * ROLE MAPPING STRATEGY:
 * 1. If role is already valid (system, user, assistant, tool, function, developer) → keep as-is
 * 2. If message has additional_kwargs.node_metadata.nodeType → use that to determine role:
 *    - nodeType = "tool" or "script" → role = "tool" (with tool_call_id from pending queue)
 *    - nodeType = "llm" or "agent" → role = "assistant"
 * 3. If unknown role with pending tool_call → role = "tool" (with tool_call_id)
 * 4. Otherwise → role = "assistant"
 * 
 * OpenAI REQUIREMENT: Every tool_call must have a matching tool response!
 */
function convertMessages(inputMessages, toolNameMap) {
    const convertedMessages = [];
    
    // Queue to track pending tool_call_ids that need responses
    const pendingToolCallIds = [];

    for (let i = 0; i < inputMessages.length; i += 1) {
        const msg = inputMessages[i];
        const content = convertMessageContent(msg.content);

        // Normalize assistant tool_calls into OpenAI format
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            const normalizedToolCalls = msg.tool_calls.map((call, idx) => {
                const callId = call.id || `call_${Date.now()}_${i}_${idx}`;

                let rawName = '';
                let rawArgs = {};

                // KeyStudio style: { id, name, args }
                if (call.name) {
                    rawName = call.name;
                    rawArgs = call.args || {};
                }

                // OpenAI-like style: { id, function: { name, arguments }, type }
                if (call.function && call.function.name) {
                    rawName = call.function.name;
                    if (typeof call.function.arguments === 'string') {
                        rawArgs = call.function.arguments;
                    } else {
                        rawArgs = call.function.arguments || {};
                    }
                }

                // Heuristic: if internal node name was used, try to infer actual tool name
                // from the immediate next message: "Executed **tool_name** ..."
                if (!toolNameMap[rawName] && inputMessages[i + 1]) {
                    const nextContent = convertMessageContent(inputMessages[i + 1].content);
                    const executedMatch = nextContent.match(/Executed \*\*([^*]+)\*\*/i);
                    if (executedMatch && executedMatch[1]) {
                        rawName = executedMatch[1].trim();
                    }
                }

                const finalName = toolNameMap[rawName] || rawName;
                const argumentsString = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {});

                // Track this tool_call_id - it needs a response!
                pendingToolCallIds.push(callId);

                return {
                    id: callId,
                    type: 'function',
                    function: {
                        name: finalName,
                        arguments: argumentsString
                    }
                };
            });

            convertedMessages.push({
                role: 'assistant',
                content: content || '',
                tool_calls: normalizedToolCalls
            });
            continue;
        }

        // SIMPLE LOGIC:
        // If role is user, assistant, or system → keep as-is
        // If role is anything else → it's a tool response
        
        const validRoles = new Set(['user', 'assistant', 'system']);
        
        if (validRoles.has(msg.role)) {
            // Valid role - keep as-is
            // Skip empty messages
            if (!content || content.trim() === '') {
                continue;
            }
            convertedMessages.push({
                role: msg.role,
                content: content
            });
        } else {
            // Invalid role (like "get_contracts_by_supplier_name", "store_contract_node", etc.)
            // This is a tool response - assign pending tool_call_id
            if (pendingToolCallIds.length > 0) {
                const toolCallId = pendingToolCallIds.shift();
                convertedMessages.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: content || ''
                });
            }
            // If no pending tool_call_id, skip this message (orphan response)
        }
    }

    return convertedMessages;
}

// ============================================
// GENERATORS
// ============================================

/**
 * Get configuration from UI
 */
function getConfig() {
    return {
        apiEndpoint: 'https://openaiqc.gep.com/platform2/openai/deployments/gpt-5.2/chat/completions',
        apiVersion: document.getElementById('apiVersion').value || '2024-02-01',
        apiKey: document.getElementById('apiKey').value || '<Your openai key>',
        hostHeader: document.getElementById('hostHeader').value || 'api.openai.com',
        temperature: parseFloat(document.getElementById('temperature').value) || 0.1,
        topP: parseFloat(document.getElementById('topP').value) || 0.1,
        toolChoice: document.getElementById('toolChoice').value || 'auto',
        frequencyPenalty: parseFloat(document.getElementById('frequencyPenalty').value) || 0,
        presencePenalty: parseFloat(document.getElementById('presencePenalty').value) || 0,
        maxOutputTokens: parseInt(document.getElementById('maxOutputTokens').value) || 1000
    };
}

/**
 * Generate the request body
 */
function generateRequestBody(config, messages, tools) {
    const body = {
        temperature: config.temperature,
        top_p: config.topP,
        frequency_penalty: config.frequencyPenalty,
        presence_penalty: config.presencePenalty,
        max_completion_tokens: config.maxOutputTokens,
        tool_choice: config.toolChoice,
        messages: messages,
        tools: tools
    };
    
    return body;
}

/**
 * Generate curl command
 */
function generateCurlCommand(config, requestBody) {
    const fullUrl = `${config.apiEndpoint}?api-version=${config.apiVersion}&api-key=${config.apiKey}`;
    
    // Pretty print JSON
    const jsonBody = JSON.stringify(requestBody, null, 4);
    
    // Escape single quotes for bash
    const escapedBody = jsonBody.replace(/'/g, "'\\''");
    
    return `curl --location '${fullUrl}' \\
--header 'Host: ${config.hostHeader}' \\
--header 'Content-Type: application/json' \\
--data '${escapedBody}'`;
}

/**
 * Generate PowerShell command
 */
function generatePowerShellCommand(config, requestBody) {
    const fullUrl = `${config.apiEndpoint}?api-version=${config.apiVersion}&api-key=${config.apiKey}`;
    const jsonBody = JSON.stringify(requestBody, null, 2);
    
    return `$headers = @{
    "Host" = "${config.hostHeader}"
    "Content-Type" = "application/json"
}

$body = @'
${jsonBody}
'@

Invoke-RestMethod -Uri "${fullUrl}" -Method Post -Headers $headers -Body $body`;
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Main generate function - called when button clicked
 */
function generateCurl() {
    // Hide previous outputs/errors
    document.getElementById('outputSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'none';
    
    try {
        // Validate and parse tools
        const inputTools = validateJSON('toolsInput', 'toolsValidation');
        if (!inputTools) {
            showError('Please enter valid Tools JSON array');
            return;
        }
        
        // Validate and parse messages
        const inputMessages = validateJSON('messagesInput', 'messagesValidation');
        if (!inputMessages) {
            showError('Please enter valid Messages JSON array');
            return;
        }
        
        // Convert tools from KeyStudio format to OpenAI format
        const convertedTools = convertTools(inputTools);
        const toolNameMap = buildToolNameMap(inputTools);
        
        // Convert messages to OpenAI format
        const convertedMessages = convertMessages(inputMessages, toolNameMap);
        
        if (convertedMessages.length === 0) {
            showError('No valid messages found after conversion. Please check your input.');
            return;
        }
        
        // Get configuration
        const config = getConfig();
        
        // Generate request body
        const requestBody = generateRequestBody(config, convertedMessages, convertedTools);
        
        // Generate outputs
        const bodyJSON = JSON.stringify(requestBody, null, 2);
        const curlCmd = generateCurlCommand(config, requestBody);
        const psCmd = generatePowerShellCommand(config, requestBody);
        
        // Display outputs
        document.getElementById('bodyOutput').textContent = bodyJSON;
        document.getElementById('curlOutput').textContent = curlCmd;
        document.getElementById('psOutput').textContent = psCmd;
        
        // Show output section
        document.getElementById('outputSection').style.display = 'flex';
        
        // Scroll to output
        document.getElementById('outputSection').scrollIntoView({ behavior: 'smooth' });
        
        // Show success toast
        showToast(`✓ Generated! ${convertedMessages.length} messages, ${convertedTools.length} tools`);
        
    } catch (error) {
        showError('Error generating curl: ' + error.message);
        console.error(error);
    }
}

// ============================================
// UI HELPERS
// ============================================

/**
 * Show error message
 */
function showError(message) {
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');
    
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    errorSection.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Show toast notification
 */
function showToast(message) {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

/**
 * Copy to clipboard
 */
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        // Find the copy button for this element
        const card = element.closest('.output-card');
        const btn = card.querySelector('.btn-copy');
        
        // Update button state
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<span class="copy-icon">✓</span> Copied!';
        btn.classList.add('copied');
        
        // Reset after 2 seconds
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('copied');
        }, 2000);
        
        showToast('Copied to clipboard!');
    }).catch(err => {
        showError('Failed to copy: ' + err.message);
    });
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
    const input = document.getElementById('apiKey');
    const eyeIcon = document.getElementById('eyeIcon');
    
    if (input.type === 'password') {
        input.type = 'text';
        eyeIcon.textContent = 'Hide';
    } else {
        input.type = 'password';
        eyeIcon.textContent = 'Show';
    }
}

/**
 * Format JSON in textarea
 */
function formatJSON(inputId) {
    const input = document.getElementById(inputId);
    const value = input.value.trim();
    
    if (!value) return;
    
    try {
        const parsed = JSON.parse(value);
        input.value = JSON.stringify(parsed, null, 2);
        // Hide any previous error
        document.getElementById('errorSection').style.display = 'none';
        showToast('JSON formatted!');
    } catch (e) {
        showError('Cannot format: Invalid JSON');
    }
}

/**
 * Clear input
 */
function clearInput(inputId) {
    document.getElementById(inputId).value = '';
    
    // Reset validation badge
    if (inputId === 'toolsInput') {
        const badge = document.getElementById('toolsValidation');
        badge.textContent = 'Paste JSON array';
        badge.className = 'validation-badge';
    } else if (inputId === 'messagesInput') {
        const badge = document.getElementById('messagesValidation');
        badge.textContent = 'Paste JSON array';
        badge.className = 'validation-badge';
    }
}

