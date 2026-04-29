import fetch from 'node-fetch';

async function test() {
    console.log('1. Setting Config to Google');
    await fetch('http://localhost:3002/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textmodel: "google" })
    });

    console.log('2. Starting prompt stream generation (Agent 3)');
    const reqBody = {
        beatSheet: { beats: [{ beat_id: "S1", description: "Hello world, what is the capital of France? Answer simply.", shot_id: "L1" }] },
        assets: [],
        language: "en",
        style: "Cinematic"
    };

    const res = await fetch('http://localhost:3002/api/pipeline/prompts-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
    });

    if (!res.ok) {
        console.log('Error:', res.status, res.statusText);
        console.log(await res.text());
        return;
    }

    const reader = res.body;
    let chunks = '';
    for await (const chunk of reader) {
        chunks += chunk.toString();
        console.log('--- CHUNK RECEIVED ---');
        console.log(chunk.toString());
    }
    console.log('--- DONE STREAMING ---');
}

test();
