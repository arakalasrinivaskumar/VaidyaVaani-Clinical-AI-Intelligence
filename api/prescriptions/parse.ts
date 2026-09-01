import type { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const POST = async (req: NextRequest): Promise<NextResponse> => {
  const { image, language } = await req.json();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.x.ai/v1' });
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

  try {
    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';
    const prompt = `Target language: ${language}. Parse the attached prescription.`;

    // Try OpenAI first (faster, more reliable)
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: MASTER_PROMPT },
        { role: 'user', content: prompt + '\nBase64 image data: ' + base64Data }
      ],
      response_format: { type: 'json_object' }
    });

    const responseText = response.choices[0].message.content || '';
    const cleanedJsonText = responseText.replace(/^`?(json)?\n?/i, '').replace(/\n?`?\n?$/i, '').trim();
    const resultObj = JSON.parse(cleanedJsonText);
    const parsedResponse = api.prescriptions.parse.responses[200].parse(resultObj);

    return NextResponse.json(parsedResponse);
  } catch (err) {
    console.error('OpenAI parsing error:', err);
    // Fallback to Gemini if OpenAI fails
    if (process.env.GEMINI_API_KEY) {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
      const result = await model.generateContent([
        { text: MASTER_PROMPT },
        { text: prompt },
        { inlineData: { data: base64Data, mimeType } }
      ]);
      const responseText = result.response.text();
      const cleanedJsonText = responseText.replace(/^`?(json)?\n?/i, '').replace(/\n?`?\n?$/i, '').trim();
      const resultObj = JSON.parse(cleanedJsonText);
      const parsedResponse = api.prescriptions.parse.responses[200].parse(resultObj);
      return NextResponse.json(parsedResponse);
    }
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Failed to parse prescription' },
      { status: 500 }
    );
  }
};