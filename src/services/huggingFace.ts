// src/services/huggingFace.ts
import axios from 'axios';

const HF_API_URL = 'https://api-inference.huggingface.co/models/gpt2';

export interface HFRequest {
  inputs: string;
  parameters?: {
    max_length?: number;
    temperature?: number;
    top_p?: number;
  };
}

export interface HFResponse {
  generated_text: string;
}

// Function to generate content for a specific module
export const generateModuleContent = async (
  topic: string, 
  moduleNumber: number, 
  moduleTitle: string
): Promise<string> => {
  try {
    const prompt = `Create detailed learning content for ${topic}, module ${moduleNumber} about ${moduleTitle}. Provide comprehensive information that would help someone learn this topic.`;
    
    const request: HFRequest = {
      inputs: prompt,
      parameters: {
        max_length: 150,
        temperature: 0.7,
        top_p: 0.9,
      },
    };

    const response = await axios.post(HF_API_URL, request, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_HF_API_KEY || 'your_hugging_face_key_here'}`,
        'Content-Type': 'application/json',
      },
    });
    
    return response.data[0]?.generated_text || getFallbackContent(topic, moduleNumber, moduleTitle);
  } catch (error) {
    console.error('Error calling Hugging Face API:', error);
    return getFallbackContent(topic, moduleNumber, moduleTitle);
  }
};

// Fallback content when API is not available
const getFallbackContent = (topic: string, moduleNumber: number, moduleTitle: string): string => {
  const contentMap: Record<number, string> = {
    1: `Welcome to ${topic}! This first module covers the essential ${moduleTitle.toLowerCase()}. You'll learn the fundamental concepts and basic principles that form the foundation of ${topic}. Start by understanding the core terminology and basic practices.`,
    2: `In this module, we dive deeper into ${moduleTitle.toLowerCase()} for ${topic}. This builds upon what you learned in Module 1 and introduces more complex concepts. Practice is key here - try applying these concepts in simple exercises.`,
    3: `Now we're getting to the interesting parts of ${topic}! Module 3 focuses on ${moduleTitle.toLowerCase()}, which is crucial for mastering this skill. You'll learn techniques and methods that professionals use.`,
    4: `This module covers ${moduleTitle.toLowerCase()} in ${topic}. These are practical skills that you'll use regularly. Pay close attention to the examples and try to recreate them on your own.`,
    5: `You're halfway through learning ${topic}! Module 5 explores ${moduleTitle.toLowerCase()}, which involves more advanced concepts. Don't worry if it seems challenging at first - keep practicing.`,
    6: `In this module, we focus on ${moduleTitle.toLowerCase()} for ${topic}. This is where theory meets practice. You'll learn how to apply concepts in real-world scenarios and troubleshoot common issues.`,
    7: `Module 7 covers specialized aspects of ${topic}, specifically ${moduleTitle.toLowerCase()}. This knowledge will set you apart from beginners and help you develop more sophisticated skills.`,
    8: `Congratulations on reaching the final module! Here we'll cover ${moduleTitle.toLowerCase()} and how to continue your ${topic} journey beyond this course. You'll learn about advanced resources and next steps.`
  };
  
  return contentMap[moduleNumber] || `This module covers important aspects of ${topic}. Specifically, we'll explore ${moduleTitle.toLowerCase()} and how it applies to your learning journey.`;
};

// Function to generate module titles based on topic
export const generateModuleTitles = async (topic: string): Promise<string[]> => {
  try {
    const prompt = `Create 8 learning module titles for ${topic} in a logical learning sequence. Provide only the titles, one per line, without numbers.`;
    
    const request: HFRequest = {
      inputs: prompt,
      parameters: {
        max_length: 200,
        temperature: 0.7,
        top_p: 0.9,
      },
    };

    const response = await axios.post(HF_API_URL, request, {
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_HF_API_KEY || 'none'}`,
        'Content-Type': 'application/json',
      },
    });
    
    const generatedText = response.data[0]?.generated_text || '';
    return parseGeneratedTitles(generatedText, topic);
  } catch (error) {
    console.error('Error generating module titles:', error);
    return getFallbackTitles(topic);
  }
};

// Parse the generated titles from AI response
const parseGeneratedTitles = (text: string, topic: string): string[] => {
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.match(/^(module|step|title)/i));
  
  // If we got enough lines, use them
  if (lines.length >= 8) {
    return lines.slice(0, 8);
  }
  
  // Otherwise use fallback
  return getFallbackTitles(topic);
};

// Fallback titles when API is not available
const getFallbackTitles = (topic: string): string[] => {
  return [
    `Introduction to ${topic}`,
    `Fundamental Concepts`,
    `Core Techniques`,
    `Practical Applications`,
    `Advanced Methods`,
    `Troubleshooting & Problem Solving`,
    `Specialized Topics`,
    `Next Steps & Mastery`
  ];
};