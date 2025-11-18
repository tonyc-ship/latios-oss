import { NextResponse } from 'next/server';

export const maxDuration = 300;

export async function POST(request: Request) {
  const TRANSCRIBE_URL = process.env.TRANSCRIBE_URL || 'http://localhost:8000';
  
  console.log('TRANSCRIBE_URL:', TRANSCRIBE_URL);
  
  try {
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    const response = await fetch(TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Transcription-API/1.0',
      },
      body: JSON.stringify(body),
    });
    
    console.log('Response status:', response.status);
    console.log('Response status text:', response.statusText);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response body:', errorText);
      console.error('Full error details:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText
      });
      throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}, body: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('api/media/transcribe POST data:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Transcription error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      TRANSCRIBE_URL: TRANSCRIBE_URL
    });
    return NextResponse.json(
      { success: false, error: 'Transcription failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const TRANSCRIBE_URL = process.env.TRANSCRIBE_URL || 'http://localhost:8000';

  try {
    const { searchParams } = new URL(request.url);
    const task_id = searchParams.get('task_id');
    const type = searchParams.get('type'); // 'status' or 'result'
    
    if (!task_id) {
      return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
    }
    
    // Determine endpoint based on type parameter
    const endpoint = type === 'result' ? `${TRANSCRIBE_URL}/${task_id}/result` : `${TRANSCRIBE_URL}/${task_id}/status`;
    
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(`api/media/transcribe GET task_id: ${task_id}, type: ${type || 'status'}, data:`, data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching transcription status/result:', error);
    return NextResponse.json({ error: 'Failed to fetch transcription status/result' }, { status: 500 });
  }
}