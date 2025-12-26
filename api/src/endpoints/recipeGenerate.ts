import type { AppContext } from "../types";
import { z } from "zod";

const IngredientSchema = z.object({
	id: z.string(),
	label: z.string(),
	amount: z.string(),
	futureSteps: z.array(z.number()),
	note: z.string().optional(),
});

const StepSchema = z.object({
	id: z.string(),
	label: z.string(),
	tip: z.string().optional(),
	duration: z.string().optional(),
});

const RecipePlanSchema = z.object({
	id: z.string(),
	title: z.string(),
	summary: z.string(),
	readyIn: z.string(),
	tags: z.array(z.string()).max(5),
	ingredients: z.array(IngredientSchema).min(3),
	steps: z.array(StepSchema).min(3),
});

const PromptSchema = z.object({
	prompt: z
		.string()
		.min(8, "Prompt must be at least 8 characters")
		.max(400, "Prompt must be under 400 characters"),
});

const recipeResponseFormat = {
	type: "json_schema",
	json_schema: {
		name: "recipe_plan",
		schema: {
			type: "object",
			additionalProperties: false,
			required: [
				"id",
				"title",
				"summary",
				"readyIn",
				"tags",
				"ingredients",
				"steps",
			],
			properties: {
				id: { type: "string" },
				title: { type: "string" },
				summary: { type: "string" },
				readyIn: { type: "string" },
				tags: {
					type: "array",
					items: { type: "string" },
					minItems: 1,
					maxItems: 5,
				},
				ingredients: {
					type: "array",
					minItems: 3,
					items: {
						type: "object",
						additionalProperties: false,
						required: ["id", "label", "amount", "futureSteps"],
						properties: {
							id: { type: "string" },
							label: { type: "string" },
							amount: { type: "string" },
							futureSteps: {
								type: "array",
								items: { type: "integer" },
							},
							note: { type: "string" },
						},
					},
				},
				steps: {
					type: "array",
					minItems: 3,
					items: {
						type: "object",
						additionalProperties: false,
						required: ["id", "label"],
						properties: {
							id: { type: "string" },
							label: { type: "string" },
							tip: { type: "string" },
							duration: { type: "string" },
						},
					},
				},
			},
		},
	},
} as const;

export const RecipeGenerate = async (c: AppContext) => {
	const parsed = PromptSchema.safeParse(await c.req.json().catch(() => ({})));
	if (!parsed.success) {
		return c.json({ error: parsed.error.format() }, 400);
	}

	const response = await fetch("https://api.openai.com/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
		},
		body: JSON.stringify({
			model: "gpt-4.1-mini",
			response_format: recipeResponseFormat,
			messages: [
				{
					role: "system",
					content:
						"You are a culinary assistant that designs structured recipe plans. Produce balanced ingredient lists and numbered steps. Respond only with JSON matching the provided schema.",
				},
				{
					role: "user",
					content: parsed.data.prompt,
				},
			],
		}),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		return c.json({ error: `OpenAI error ${response.status}: ${text}` }, 502);
	}

	const payload = await response.json();
	const content = payload?.choices?.[0]?.message?.content;
	if (!content) {
		return c.json({ error: "Assistant returned no content" }, 500);
	}

	let planJson;
	try {
		planJson = JSON.parse(content);
	} catch (error) {
		return c.json({ error: "Assistant response was not valid JSON" }, 500);
	}

	const plan = RecipePlanSchema.safeParse(planJson);
	if (!plan.success) {
		return c.json({ error: plan.error.format() }, 502);
	}

	return c.json({ recipe: plan.data });
};
