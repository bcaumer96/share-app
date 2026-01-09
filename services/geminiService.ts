
import { GoogleGenAI } from "@google/genai";

export const analyzeFile = async (fileName: string, fileSize: number): Promise<string> => {
  // Always use a new GoogleGenAI instance with the direct process.env.API_KEY reference.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `I am sending a file named "${fileName}" which is ${Math.round(fileSize / 1024)} KB. 
      Give me a short, friendly 1-sentence description of what this file type is usually for and a "fun fact" related to data transfer or this file extension. 
      Keep it professional yet engaging.`,
    });
    return response.text || "No analysis available.";
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return "Ready for transfer.";
  }
};