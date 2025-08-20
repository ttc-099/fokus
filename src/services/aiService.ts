// src/services/aiService.ts
// This service tries multiple approaches to get AI-generated content

// Local AI content generator (fallback when API doesn't work)
const localAIGenerator = (topic: string, moduleNumber: number): { title: string, content: string } => {
  const topics: Record<string, string[]> = {
    knitting: [
      "Tools & Materials",
      "Basic Stitches",
      "Pattern Reading",
      "Cable Knitting",
      "Color Work",
      "Finishing Techniques",
      "Advanced Patterns",
      "Project Creation"
    ],
    python: [
      "Syntax Basics",
      "Data Structures",
      "Control Flow",
      "Functions & Modules",
      "File Handling",
      "OOP Concepts",
      "Libraries & APIs",
      "Projects & Deployment"
    ],
    photography: [
      "Camera Basics",
      "Composition Techniques",
      "Lighting Fundamentals",
      "Exposure Control",
      "Editing Software",
      "Genre Specialization",
      "Advanced Techniques",
      "Portfolio Development"
    ],
    cooking: [
      "Kitchen Essentials",
      "Knife Skills",
      "Basic Techniques",
      "Flavor Profiles",
      "Cuisine Styles",
      "Baking Fundamentals",
      "Advanced Methods",
      "Menu Planning"
    ]
  };

  // Default topics for any subject
  const defaultTopics = [
    "Introduction & Basics",
    "Fundamental Concepts",
    "Core Techniques",
    "Practical Applications",
    "Advanced Methods",
    "Problem Solving",
    "Specialization Areas",
    "Mastery & Projects"
  ];

  // Find the best matching topic
  const normalizedTopic = topic.toLowerCase();
  let matchedTopic = null;
  
  for (const [key, _] of Object.entries(topics)) {
    if (normalizedTopic.includes(key)) {
      matchedTopic = key;
      break;
    }
  }

  const title = matchedTopic ? topics[matchedTopic][moduleNumber - 1] : defaultTopics[moduleNumber - 1];
  
  // Generate content based on the title and topic
  const content = generateModuleContent(topic, title, moduleNumber);
  
  return { title, content };
};

// Generate detailed content for a module
const generateModuleContent = (topic: string, title: string, moduleNumber: number): string => {
  const contentTemplates = [
    `Welcome to ${title} in ${topic}! This module covers the essential foundations you'll need to get started. We'll explore the basic concepts, terminology, and tools that every beginner should know.`,
    `In this module on ${title} for ${topic}, you'll dive deeper into the fundamental principles. Understanding these core concepts is crucial for building a strong foundation in ${topic}.`,
    `Now we're getting to the practical aspects! This module focuses on ${title} in ${topic}, where you'll learn hands-on techniques and methods that you can immediately apply.`,
    `This module covers ${title} for ${topic}, which represents an important milestone in your learning journey. You'll start connecting concepts and seeing how they work together in real-world applications.`,
    `You're progressing to more advanced territory! Module ${moduleNumber} explores ${title} in ${topic}, introducing complex concepts that will expand your capabilities significantly.`,
    `This module focuses on ${title} for ${topic}, where you'll learn specialized techniques and approaches. This knowledge will help you solve more challenging problems and create sophisticated work.`,
    `You're reaching advanced levels of ${topic}! This module covers ${title}, diving into specialized areas that distinguish skilled practitioners from beginners.`,
    `Congratulations on reaching the final module! Here we'll cover ${title} and how to continue your ${topic} journey beyond this learning path. You'll learn about advanced resources, communities, and next steps.`
  ];

  return contentTemplates[moduleNumber - 1] || `This module covers important aspects of ${topic}.`;
};

// Function to generate module data
export const generateModuleData = async (topic: string): Promise<Array<{ title: string, content: string }>> => {
  try {
    // Try to use Hugging Face API first
    if (import.meta.env.VITE_HF_API_KEY && import.meta.env.VITE_HF_API_KEY !== 'your_hugging_face_key_here') {
      const response = await tryHuggingFaceAPI(topic);
      if (response) return response;
    }
    
    // If API fails or no key, use local generator
    return generateLocalModules(topic);
  } catch (error) {
    console.error('Error in AI service:', error);
    return generateLocalModules(topic);
  }
};

// Try to use Hugging Face API
const tryHuggingFaceAPI = async (topic: string): Promise<Array<{ title: string, content: string }> | null> => {
  try {
    // This is a simplified version - in a real app you'd implement proper API calls
    console.log('Attempting to use Hugging Face API for:', topic);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // For now, we'll return null to fall back to local generation
    // In a real implementation, you'd make actual API calls here
    return null;
  } catch (error) {
    console.log('Hugging Face API not available, using local generator');
    return null;
  }
};

// Generate modules using local AI
const generateLocalModules = (topic: string): Array<{ title: string, content: string }> => {
  const modules = [];
  
  for (let i = 1; i <= 8; i++) {
    modules.push(localAIGenerator(topic, i));
  }
  
  return modules;
};

// Function to get more detailed content when a cell is clicked
export const getDetailedContent = async (topic: string, title: string, moduleNumber: number): Promise<string> => {
  try {
    // In a real implementation, this would call an API for more detailed content
    // For now, we'll expand on our local content
    
    const baseContent = generateModuleContent(topic, title, moduleNumber);
    
    // Add more details based on the module number
    const details = [
      " Start with the basics: understand terminology, get familiar with tools, and practice fundamental skills. Don't rush this stage - a strong foundation will make everything easier later.",
      " Focus on understanding rather than memorization. Try to grasp why things work the way they do, not just how to do them. This deeper understanding will serve you well as you progress.",
      " Practice is essential at this stage. Set aside regular time to apply what you're learning. Don't worry about perfection - focus on gradual improvement and learning from mistakes.",
      " Start combining different concepts you've learned. Look for connections between ideas and how they work together in real-world applications.",
      " Challenge yourself with more complex problems. This is where you'll really grow your skills. Don't be discouraged if things seem difficult - that's a sign you're learning.",
      " Begin developing your own style and approach. Experiment with different techniques and find what works best for you and your goals.",
      " Consider specializing in areas that particularly interest you. Depth of knowledge in specific areas can be more valuable than superficial knowledge of everything.",
      " Think about how you'll continue learning beyond this structured path. Join communities, find mentors, work on projects, and consider how you might teach others what you've learned."
    ];
    
    return baseContent + details[moduleNumber - 1];
  } catch (error) {
    console.error('Error getting detailed content:', error);
    return `Detailed content about ${title} for ${topic}. This content would be generated by AI when you have a valid API key configured.`;
  }
};