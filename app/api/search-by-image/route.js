
import { NextResponse } from 'next/server';
import { gemini } from '@/configs/gemini';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const image = formData.get('image');
    if (!image) {
      return NextResponse.json({ error: 'No image uploaded' }, { status: 400 });
    }

    // Convert image to base64
    const arrayBuffer = await image.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = image.type || 'image/jpeg';

    // Send image to Gemini for analysis
    const model = gemini.getGenerativeModel({ model: "gemini-pro-vision" });
    const prompt = `You are an expert product identifier for an e-commerce site. Analyze the image and return ONLY the most relevant product keyword (e.g., "shoes", "headphones", "t-shirt"). Do not return sentences, descriptions, or extra text. Output just the keyword.`;
    const imagePart = {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    };
    const result = await model.generateContent([prompt, imagePart]);
    console.log('Gemini raw result:', JSON.stringify(result, null, 2));
    const raw = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log('Gemini extracted text:', raw);
    let keyword = raw;
    try {
      const parsed = JSON.parse(raw);
      keyword = parsed.keyword || parsed.name || raw;
      console.log('Gemini parsed keyword:', keyword);
    } catch (e) {
      console.log('Gemini parse error:', e);
    }
    return NextResponse.json({ keyword });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Image search failed' }, { status: 500 });
  }
}
