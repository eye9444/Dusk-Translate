// Browser-only transport. Keys and endpoint settings never enter project snapshots.
globalThis.DuskProviders = (() => {
  const names = {ai:'Google AI Studio',or:'OpenRouter',openai:'OpenAI',claude:'Claude',custom:'Custom endpoint'};
  function baseURL(provider, custom) {
    const bases = {openai:'https://api.openai.com/v1',claude:'https://api.anthropic.com/v1',or:'https://openrouter.ai/api/v1'};
    if (provider !== 'custom') {
      if (!bases[provider]) throw new Error('Unsupported provider.');
      return bases[provider];
    }
    let url;
    try { url = new URL(custom); } catch { throw new Error('Enter a full HTTPS API base URL, including /v1 if required.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS base URL without credentials, query parameters, or a fragment.');
    return url.href.replace(/\/+$/, '');
  }
  function headers(provider, key) {
    return provider === 'claude'
      ? {'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}
      : {Authorization:`Bearer ${key}`};
  }
  async function request(url, options) {
    let response;
    try { response = await fetch(url, {...options, redirect:'error', credentials:'omit'}); }
    catch(error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Could not reach the provider. Check the endpoint, network, and whether it allows browser requests (CORS).');
    }
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}. Check your key, model access, billing, and endpoint.`);
    return response;
  }
  async function models(provider, key, custom) {
    const base = baseURL(provider, custom), result = [];
    let after = '', previous = '';
    do {
      const response = await request(`${base}/models${after ? '?after_id='+encodeURIComponent(after) : ''}`, {headers:headers(provider,key),signal:AbortSignal.timeout(30000)});
      const body = await response.json();
      if (!Array.isArray(body.data)) throw new Error('This endpoint did not return a supported model catalog. Enter a model ID manually.');
      result.push(...body.data.map(m=>({...m,displayName:m.display_name||m.id})));
      previous = after;
      after = provider === 'claude' && body.has_more ? body.last_id : '';
      if (after && after === previous) throw new Error('Provider returned a repeated catalog page.');
    } while (after);
    return provider === 'openai' ? result.filter(m=>/^(gpt-|chatgpt-|o\d)/.test(m.id) && !/image|audio|transcri|tts|realtime|search|deep-research/.test(m.id)) : result;
  }
  async function stream({provider,key,custom,model,prompt,signal,onText,onActivity}) {
    const claude = provider === 'claude';
    const response = await request(`${baseURL(provider,custom)}/${claude?'messages':'chat/completions'}`, {
      method:'POST', headers:{...headers(provider,key),'Content-Type':'application/json'}, signal,
      body:JSON.stringify({model,stream:true,messages:[{role:'user',content:prompt}],...(claude?{max_tokens:8192}:{})})
    });
    if (!response.body) throw new Error('Provider returned no response stream.');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', finish = null, ended = false;
    function event(block) {
      const data = block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n').trim();
      if (!data) return;
      if (data === '[DONE]') { ended=true; return; }
      const value = JSON.parse(data);
      if (value.error || value.type === 'error') throw new Error('Provider interrupted the stream. Retry after checking provider status.');
      onActivity();
      if (claude) {
        if (value.type === 'content_block_delta' && value.delta?.type === 'text_delta') onText(value.delta.text);
        if (value.type === 'message_delta' && value.delta?.stop_reason) finish=value.delta.stop_reason;
        if (value.type === 'message_stop') ended=true;
      } else {
        const choice=value.choices?.[0];
        if (typeof choice?.delta?.content === 'string') onText(choice.delta.content);
        if (choice?.finish_reason) finish=choice.finish_reason;
      }
    }
    try {
      while (true) {
        const {done,value}=await reader.read();
        buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
        buffer=buffer.replace(/\r\n/g,'\n');
        let boundary;
        while ((boundary=buffer.indexOf('\n\n'))>=0) {event(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}
        if(done){if(buffer.trim())event(buffer);break;}
      }
    } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
    // A DONE marker alone must not turn truncated/filtered output into success.
    return !signal.aborted && (claude ? ended && ['end_turn','stop_sequence'].includes(finish) : finish==='stop');
  }
  return {names,baseURL,models,stream};
})();
