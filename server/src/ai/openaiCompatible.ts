// openai-compatible provider — works with openai, hugging face's router,
// or any server that speaks the /chat/completions protocol

import type { AiProvider, RoadmapPlan } from "./types";

interface Options {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// strip markdown code fences some models wrap around json
const extractJson = (text: string): unknown => {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
};

// one chat completion call, json mode on
const chat = async (opts: Options, system: string, user: string) => {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ai request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("ai returned no content");
  return content;
};

// build the provider for a given endpoint config
export const makeOpenAiCompatibleProvider = (
  opts: Options,
  label: string,
): AiProvider => ({
  name: label,

  async generateRoadmap(topic, goal, moduleCount) {
    const system =
      "You are a curriculum designer. Always answer with a single JSON object, no prose.";
    const user = [
      `Design a learning roadmap for the topic: "${topic}".`,
      goal ? `The learner's goal is: "${goal}".` : "",
      `Return exactly ${moduleCount} modules in learning order.`,
      'Format: {"title": "<roadmap title>", "cells": [{"title": "<short module title>", "summary": "<one sentence on what this module covers and why>"}]}',
    ]
      .filter(Boolean)
      .join("\n");

    const parsed = extractJson(await chat(opts, system, user)) as RoadmapPlan;

    // basic shape check before trusting the model
    if (
      !parsed ||
      !Array.isArray(parsed.cells) ||
      parsed.cells.length === 0 ||
      typeof parsed.cells[0].title !== "string"
    ) {
      throw new Error("ai returned an unexpected roadmap shape");
    }

    return {
      title: typeof parsed.title === "string" ? parsed.title : topic,
      cells: parsed.cells.slice(0, moduleCount),
    };
  },

  async generateCellDetail(topic, cellTitle, order, moduleCount) {
    const system =
      "You are a supportive tutor. Always answer with a single JSON object, no prose.";
    const user = [
      `Roadmap topic: "${topic}". Module ${order} of ${moduleCount}: "${cellTitle}".`,
      'Write a detailed but practical study guide (~180 words) for this module: what to learn, in what order, and one concrete exercise to prove understanding.',
      'Format: {"detail": "<the study guide>"}',
    ].join("\n");

    const parsed = extractJson(await chat(opts, system, user)) as {
      detail?: string;
    };
    if (!parsed?.detail) throw new Error("ai returned no detail");
    return parsed.detail;
  },
});
