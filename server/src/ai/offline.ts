// offline provider — deterministic template generator, no api key needed
// ported from the original frontend aiService.ts so fokus always works

import type { AiProvider, RoadmapPlan } from "./types";

// hand-written module titles for topics the original prototype knew about
const knownTopics: Record<string, string[]> = {
  knitting: [
    "Tools & Materials",
    "Basic Stitches",
    "Pattern Reading",
    "Cable Knitting",
    "Color Work",
    "Finishing Techniques",
    "Advanced Patterns",
    "Project Creation",
  ],
  python: [
    "Syntax Basics",
    "Data Structures",
    "Control Flow",
    "Functions & Modules",
    "File Handling",
    "OOP Concepts",
    "Libraries & APIs",
    "Projects & Deployment",
  ],
  photography: [
    "Camera Basics",
    "Composition Techniques",
    "Lighting Fundamentals",
    "Exposure Control",
    "Editing Software",
    "Genre Specialization",
    "Advanced Techniques",
    "Portfolio Development",
  ],
  cooking: [
    "Kitchen Essentials",
    "Knife Skills",
    "Basic Techniques",
    "Flavor Profiles",
    "Cuisine Styles",
    "Baking Fundamentals",
    "Advanced Methods",
    "Menu Planning",
  ],
};

// generic progression used for any other topic
const defaultTopics = [
  "Introduction & Basics",
  "Fundamental Concepts",
  "Core Techniques",
  "Practical Applications",
  "Advanced Methods",
  "Problem Solving",
  "Specialization Areas",
  "Mastery & Projects",
];

// find a known topic table matching the user's input
const matchTopic = (topic: string): string[] | null => {
  const lowered = topic.toLowerCase();
  for (const key of Object.keys(knownTopics)) {
    if (lowered.includes(key)) return knownTopics[key];
  }
  return null;
};

// pick titles for the requested number of modules, cycling if needed
const titlesFor = (topic: string, count: number): string[] => {
  const base = matchTopic(topic) ?? defaultTopics;
  return Array.from({ length: count }, (_, i) => base[i % base.length]);
};

// one summary sentence per stage of the journey
const summaryTemplates = [
  "Get set up with the essentials: terminology, tools, and the fundamental skills everything else builds on.",
  "Understand the core ideas deeply — why things work, not just how to do them.",
  "Hands-on practice time. Apply the basics with simple exercises until they feel natural.",
  "Start combining concepts and see how they fit together in real situations.",
  "Push into harder material. Expect friction — that's the learning happening.",
  "Develop your own style and judgement through experimentation and review.",
  "Go deep on the areas that interest you most and that suit your goals.",
  "Consolidate everything with a real project, then plan how you keep growing.",
];

// the offline provider
export const offlineProvider: AiProvider = {
  name: "offline",

  async generateRoadmap(topic, goal, moduleCount) {
    const titles = titlesFor(topic, moduleCount);

    const plan: RoadmapPlan = {
      title: topic.trim(),
      cells: titles.map((title, i) => ({
        title,
        summary:
          summaryTemplates[i % summaryTemplates.length] +
          (goal ? ` Keeps your goal in focus: ${goal}.` : ""),
      })),
    };

    return plan;
  },

  async generateCellDetail(topic, cellTitle, order, moduleCount) {
    const stage = Math.min(order, moduleCount);
    const parts = [
      `Module ${stage} of ${moduleCount} in your ${topic} roadmap: ${cellTitle}.`,
      summaryTemplates[(stage - 1) % summaryTemplates.length],
      "Suggested approach: spend focused sessions on this step, build one small artefact that proves you understand it, and only move on when you could explain it to someone else.",
    ];
    return parts.join(" ");
  },
};
