import type { FormEvent, ReactElement } from "react";
import { useMemo, useState, useEffect, useRef } from "react";
import "./App.scss";

type Ingredient = {
	id: string;
	label: string;
	amount: string;
	futureSteps: number[];
	note?: string;
};

type Step = {
	id: string;
	label: string;
	tip?: string;
	duration?: string;
};

type RecipePlan = {
	id: string;
	title: string;
	summary: string;
	readyIn: string;
	tags: string[];
	ingredients: Ingredient[];
	steps: Step[];
};

type ListEntry = {
	id: string;
	recipeId: string;
	title: string;
	summary: string;
	timeLabel: string;
	tags: string[];
};

type LeftTab = "history" | "favorites";

type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
};

const recipes: RecipePlan[] = [
	{
		id: "charred-harissa-salmon",
		title: "Charred Citrus Harissa Salmon",
		summary: "Smoky sheet-pan salmon glossed with blood orange and harissa glaze, finished with crisp fennel.",
		readyIn: "45 min • serves 2",
		tags: ["high protein", "sheet pan", "gluten free"],
		ingredients: [
			{
				id: "salmon",
				label: "Salmon fillets",
				amount: "2 (5 oz)",
				futureSteps: [1, 2, 4],
				note: "Pat dry for crisp edges",
			},
			{
				id: "citrus",
				label: "Blood oranges",
				amount: "2, juiced",
				futureSteps: [0, 1],
				note: "Reserve zest",
			},
			{
				id: "fennel",
				label: "Fennel bulb",
				amount: "1, shaved",
				futureSteps: [3],
				note: "Toss with citrus oil",
			},
			{
				id: "yogurt",
				label: "Skyr or Greek yogurt",
				amount: "1/2 cup",
				futureSteps: [4],
				note: "Fold in herbs",
			},
		],
		steps: [
			{
				id: "step-1",
				label: "Whisk citrus, harissa, and honey into a sticky glaze.",
				tip: "Set aside 2 tbsp for finishing.",
			},
			{
				id: "step-2",
				label: "Brush salmon, roast at 425°F until caramelized.",
				duration: "12 min",
			},
			{
				id: "step-3",
				label: "Toss fennel, herbs, and citrus oil for a quick salad.",
			},
			{
				id: "step-4",
				label: "Swirl reserved glaze into yogurt for serving.",
			},
			{
				id: "step-5",
				label: "Plate salmon over fennel salad and spoon citrus yogurt on top.",
			},
		],
	},
	{
		id: "porcini-orzo",
		title: "Porcini Butter Orzo",
		summary: "Silky orzo risotto with roasted mushrooms, parmesan broth, and herb oil finish.",
		readyIn: "35 min • serves 3",
		tags: ["comfort", "vegetarian", "one pot"],
		ingredients: [
			{
				id: "orzo",
				label: "Toasted orzo",
				amount: "1 1/2 cups",
				futureSteps: [1, 2],
				note: "Stir frequently",
			},
			{
				id: "mushrooms",
				label: "Wild mushrooms",
				amount: "12 oz",
				futureSteps: [0, 3],
				note: "Roast until crisp",
			},
			{
				id: "porcini",
				label: "Porcini broth",
				amount: "3 cups warm",
				futureSteps: [1],
				note: "Ladle gradually",
			},
			{
				id: "butter",
				label: "Brown butter",
				amount: "3 tbsp",
				futureSteps: [2],
				note: "Finish off heat",
			},
		],
		steps: [
			{
				id: "porcini-step-1",
				label: "Roast mushrooms with thyme until concentrated.",
			},
			{
				id: "porcini-step-2",
				label: "Toast orzo, then ladle in porcini broth like risotto.",
			},
			{
				id: "porcini-step-3",
				label: "Emulsify with brown butter and parmesan.",
			},
			{
				id: "porcini-step-4",
				label: "Fold in mushrooms and drizzle herb oil.",
			},
		],
	},
	{
		id: "saffron-ramen",
		title: "Saffron Coconut Ramen",
		summary: "Velvety coconut broth with chili crisp veggies and jammy eggs.",
		readyIn: "30 min • serves 2",
		tags: ["spicy", "brothy", "weeknight"],
		ingredients: [
			{
				id: "stock",
				label: "Coconut stock",
				amount: "4 cups",
				futureSteps: [0, 1],
				note: "Simmer with saffron",
			},
			{
				id: "noodles",
				label: "Fresh ramen",
				amount: "14 oz",
				futureSteps: [2],
				note: "Cook separately",
			},
			{
				id: "veg",
				label: "Charred snap peas",
				amount: "1 cup",
				futureSteps: [3],
				note: "Finish with chili crisp",
			},
		],
		steps: [
			{
				id: "ramen-step-1",
				label: "Bloom saffron in coconut milk with lemongrass.",
			},
			{
				id: "ramen-step-2",
				label: "Simmer broth with aromatics until plush.",
			},
			{
				id: "ramen-step-3",
				label: "Cook ramen and toss with sesame oil.",
			},
			{
				id: "ramen-step-4",
				label: "Layer bowls: noodles, veg, pour broth, top with chili crisp.",
			},
		],
	},
];

const promptSuggestions = [
	"Smoky vegan stew for two",
	"High-protein meal prep with salmon",
	"One-pot pasta with crunchy toppings",
];

function App(): ReactElement {
	const [viewMode, setViewMode] = useState<"idle" | "active">("idle");
	const [prompt, setPrompt] = useState<string>("");
	const [activeTab, setActiveTab] = useState<LeftTab>("history");
	const [selectedRecipeId, setSelectedRecipeId] = useState<string>(recipes[0].id);
	const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
	const [hoveredIngredientId, setHoveredIngredientId] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [conversation, setConversation] = useState<ChatMessage[]>([]);
	const [history, setHistory] = useState<ListEntry[]>([]);
	const [favorites, setFavorites] = useState<ListEntry[]>([]);
	const [chatInput, setChatInput] = useState<string>("");
	const [isAccountMenuOpen, setIsAccountMenuOpen] = useState<boolean>(false);

	const accountMenuRef = useRef<HTMLDivElement | null>(null);

	const selectedRecipe = useMemo(() => {
		return recipes.find((recipe) => recipe.id === selectedRecipeId) ?? recipes[0];
	}, [selectedRecipeId]);

	useEffect(() => {
		setCurrentStepIndex(0);
	}, [selectedRecipeId]);

	useEffect(() => {
		const handleClickAway = (event: MouseEvent) => {
			if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
				setIsAccountMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickAway);
		return () => document.removeEventListener("mousedown", handleClickAway);
	}, []);

	const listEntries = useMemo(() => {
		return activeTab === "history" ? history : favorites;
	}, [activeTab, favorites, history]);

	const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

	const syncConversation = (userText: string | undefined, plan: RecipePlan, assistantOverride?: string) => {
		const trimmedUser = userText?.trim();
		const assistantCopy =
			assistantOverride ?? `I'll guide you through ${plan.title}. Expect ${plan.steps.length} steps with highlights like ${plan.tags.slice(0, 2).join(" & ")}.`;
		const updates: ChatMessage[] = [];
		if (trimmedUser) {
			updates.push({
				id: makeId("user"),
				role: "user",
				content: trimmedUser,
				timestamp: Date.now(),
			});
		}
		updates.push({
			id: makeId("assistant"),
			role: "assistant",
			content: assistantCopy,
			timestamp: Date.now() + 1,
		});
		if (!updates.length) {
			return;
		}
		setConversation((prev) => [...prev, ...updates]);
	};

	const showToast = (message: string) => {
		setToast(message);
		window.setTimeout(() => {
			setToast(null);
		}, 2200);
	};

	const handlePromptSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!prompt.trim()) {
			return;
		}
		const lowered = prompt.toLowerCase();
		const matchedRecipe = recipes.find((recipe) => lowered.includes(recipe.title.toLowerCase().split(" ")[0]));
		const targetRecipe = matchedRecipe ?? recipes[0];
		handleSelectRecipe(targetRecipe.id, prompt, { trackHistory: true });
	};

	type SelectOptions = {
		trackHistory?: boolean;
	};

	const handleSelectRecipe = (recipeId: string, userMessage?: string, options?: SelectOptions) => {
		const nextRecipe = recipes.find((recipe) => recipe.id === recipeId) ?? recipes[0];
		setSelectedRecipeId(nextRecipe.id);
		setViewMode("active");
		setHoveredIngredientId(null);
		syncConversation(userMessage, nextRecipe);
		const trimmedMessage = userMessage?.trim();
		if (trimmedMessage && options?.trackHistory) {
			setHistory((prev) => {
				const remaining = prev.filter((entry) => entry.recipeId !== nextRecipe.id);
				const newEntry: ListEntry = {
					id: makeId("hist"),
					recipeId: nextRecipe.id,
					title: nextRecipe.title,
					summary: trimmedMessage,
					timeLabel: "Just now",
					tags: nextRecipe.tags.slice(0, 2),
				};
				return [newEntry, ...remaining];
			});
		}
	};

	const handleAccountAction = (action: "profile" | "settings" | "logout") => {
		setIsAccountMenuOpen(false);
		if (action === "logout") {
			showToast("Signing out...");
			return;
		}
		if (action === "profile") {
			showToast("Opening profile");
		} else {
			showToast("Opening account settings");
		}
	};

	const handleCopyPlan = async () => {
		const compiled = [
			selectedRecipe.title,
			selectedRecipe.summary,
			"Ingredients:",
			...selectedRecipe.ingredients.map((ingredient) => `- ${ingredient.amount} ${ingredient.label}`),
			"Steps:",
			...selectedRecipe.steps.map((step, index) => `${index + 1}. ${step.label}`),
		].join("\n");
		try {
			await navigator.clipboard.writeText(compiled);
			showToast("Plan copied");
		} catch {
			showToast("Clipboard unavailable");
		}
	};

	const handleSavePlan = () => {
		setIsSaving(true);
		window.setTimeout(() => {
			setIsSaving(false);
			setFavorites((prev) => {
				const alreadySaved = prev.some((entry) => entry.recipeId === selectedRecipe.id);
				if (alreadySaved) {
					showToast("Already in favorites");
					return prev;
				}
				const newEntry: ListEntry = {
					id: makeId("fav"),
					recipeId: selectedRecipe.id,
					title: selectedRecipe.title,
					summary: selectedRecipe.summary,
					timeLabel: "Just now",
					tags: selectedRecipe.tags.slice(0, 2),
				};
				showToast("Added to favorites");
				return [newEntry, ...prev];
			});
		}, 900);
	};

	const handleReset = () => {
		setPrompt("");
		setViewMode("idle");
		setHoveredIngredientId(null);
		setCurrentStepIndex(0);
		setConversation([]);
	};

	const generateAssistantReply = (question: string, plan: RecipePlan): string => {
		const lower = question.toLowerCase();
		if (lower.includes("recommend") || lower.includes("suggest")) {
			const alternative = recipes.find((recipe) => recipe.id !== plan.id) ?? plan;
			return `I recommend trying ${alternative.title} next. It brings ${alternative.tags.slice(0, 2).join(" and ")} to the table.`;
		}
		if (lower.includes("time") || lower.includes("long")) {
			return `${plan.title} wraps in ${plan.readyIn}. Let me know if you want a faster option.`;
		}
		return `For ${plan.title}, focus on ${plan.steps[0].label.toLowerCase()} to start. I can suggest swaps if you need them.`;
	};

	const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!chatInput.trim()) {
			return;
		}
		const reply = generateAssistantReply(chatInput, selectedRecipe);
		syncConversation(chatInput, selectedRecipe, reply);
		setChatInput("");
	};

	const goToStep = (delta: number) => {
		setCurrentStepIndex((prev) => {
			const next = prev + delta;
			if (next < 0) {
				return 0;
			}
			if (next >= selectedRecipe.steps.length) {
				return selectedRecipe.steps.length - 1;
			}
			return next;
		});
	};

	return (
		<div className={`app-shell ${viewMode}`}>
			<div className="top-rail">
				<div className="brand-mark">
					<p className="eyebrow">Recipe chat</p>
					<h2>Atelier Pantry</h2>
				</div>
				<div className="account-menu" ref={accountMenuRef}>
					<button
						type="button"
						className="account-trigger"
						aria-haspopup="menu"
						aria-expanded={isAccountMenuOpen}
						onClick={() => setIsAccountMenuOpen((prev) => !prev)}
					>
						AG
					</button>
					<div className="account-meta">
						<span>Alex Gardner</span>
						<p>Premium home cook</p>
					</div>
					{isAccountMenuOpen && (
						<div className="account-dropdown" role="menu">
							<button type="button" onClick={() => handleAccountAction("profile")} role="menuitem">
								Profile
							</button>
							<button type="button" onClick={() => handleAccountAction("settings")} role="menuitem">
								Account settings
							</button>
							<button type="button" onClick={() => handleAccountAction("logout")} role="menuitem" className="danger">
								Log out
							</button>
						</div>
					)}
				</div>
			</div>
			<aside className="panel list-panel">
				<header className="panel-heading">
					<div>
						<p className="eyebrow">Recipe log</p>
						<h2>History & favorites</h2>
					</div>
					<div className="tab-switch" role="tablist">
						<button
							type="button"
							className={activeTab === "history" ? "is-active" : undefined}
							onClick={() => setActiveTab("history")}
						>
							History
						</button>
						<button
							type="button"
							className={activeTab === "favorites" ? "is-active" : undefined}
							onClick={() => setActiveTab("favorites")}
						>
							Favorites
						</button>
					</div>
				</header>
				<ul className="story-list">
					{listEntries.length === 0 ? (
						<li className="empty-state">Start a conversation to populate this list.</li>
					) : (
						listEntries.map((entry) => (
							<li key={entry.id}>
								<button
									type="button"
									className={`story-card ${selectedRecipeId === entry.recipeId ? "is-selected" : ""}`}
									onClick={() => handleSelectRecipe(entry.recipeId, `Can we revisit ${entry.title}?`, { trackHistory: false })}
								>
									<div className="story-title-row">
										<span>{entry.title}</span>
										<time>{entry.timeLabel}</time>
									</div>
									<p>{entry.summary}</p>
									<div className="story-tags">
										{entry.tags.map((tag) => (
											<span key={`${entry.id}-${tag}`}>{tag}</span>
										))}
									</div>
								</button>
							</li>
						))
					)}
				</ul>
			</aside>
			<section className="panel main-panel">
				{viewMode === "idle" ? (
					<div className="prompt-panel">
						<p className="eyebrow">Recipe chatbot</p>
						<h1>What would you like to make today?</h1>
						<p className="lede">
							Describe cravings, pantry finds, or dietary vibes and I will draft recipes, timing, and a step plan.
						</p>
						<form className="prompt-form" onSubmit={handlePromptSubmit}>
							<input
								type="text"
								placeholder="e.g., Cozy vegan ramen with crispy toppings"
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
							/>
							<button type="submit">Generate plan</button>
						</form>
						<div className="prompt-suggestions">
							{promptSuggestions.map((suggestion) => (
								<button
									key={suggestion}
									type="button"
									onClick={() => {
										setPrompt(suggestion);
										handleSelectRecipe(recipes[0].id, suggestion, { trackHistory: true });
									}}
								>
									{suggestion}
								</button>
							))}
						</div>
					</div>
				) : (
					<div className="recipe-stage">
						<header className="stage-head">
							<div>
								<p className="eyebrow">Chef's plan</p>
								<h1>{selectedRecipe.title}</h1>
								<p className="lede">{selectedRecipe.summary}</p>
							</div>
							<div className="action-toolbar" role="toolbar" aria-label="recipe actions">
								<button type="button" onClick={handleCopyPlan}>
									Copy
								</button>
								<button type="button" onClick={handleSavePlan} disabled={isSaving}>
									{isSaving ? "Saving…" : "Save"}
								</button>
								<button type="button" className="ghost" onClick={handleReset}>
									Reset
								</button>
							</div>
						</header>
						<div className="tag-row">
							<span>{selectedRecipe.readyIn}</span>
							{selectedRecipe.tags.map((tag) => (
								<span key={`${selectedRecipe.id}-${tag}`}>{tag}</span>
							))}
						</div>
						<div className="recipe-columns">
							<div className="ingredients-card">
								<div className="card-head">
									<h3>Ingredients</h3>
									<span>{selectedRecipe.readyIn}</span>
								</div>
								<ul className="ingredients-list">
									{selectedRecipe.ingredients.map((ingredient) => {
										const isHovered = hoveredIngredientId === ingredient.id;
										const ingredientSteps = ingredient.futureSteps
												.map((stepIndex) => selectedRecipe.steps[stepIndex])
												.filter((step): step is Step => Boolean(step));
										return (
											<li
												key={ingredient.id}
												onMouseEnter={() => setHoveredIngredientId(ingredient.id)}
												onMouseLeave={() => setHoveredIngredientId(null)}
												className={isHovered ? "is-hovered" : undefined}
											>
												<div className="ingredient-row">
													<div>
														<p>{ingredient.label}</p>
														<span>{ingredient.amount}</span>
													</div>
													<small>{ingredient.note}</small>
												</div>
												<div className={`ingredient-detail ${isHovered ? "is-visible" : ""}`}>
													<p className="eyebrow">Steps queued</p>
													{ingredientSteps.length ? (
														<ol>
															{ingredientSteps.map((step) => (
																<li key={step.id}>{step.label}</li>
															))}
														</ol>
													) : (
														<p className="muted">No specific steps queued just yet.</p>
													)}
												</div>
											</li>
										);
									})}
								</ul>
							</div>
							<div className="recipe-carousel">
								<div className="card-head">
									<h3>Other matches</h3>
									<span>Tap to swap</span>
								</div>
								<div className="recipe-card-grid">
									{recipes.map((recipe) => (
										<button
											key={recipe.id}
											type="button"
											className={recipe.id === selectedRecipeId ? "is-active" : undefined}
											onClick={() => handleSelectRecipe(recipe.id, `Switch to ${recipe.title}`, { trackHistory: false })}
										>
											<p className="eyebrow">{recipe.readyIn}</p>
											<h4>{recipe.title}</h4>
											<p>{recipe.summary}</p>
										</button>
									))}
								</div>
							</div>
						</div>
					</div>
				)}
			</section>
			{viewMode === "active" && (
				<section className="panel tracker-panel">
					<header>
						<p className="eyebrow">Step tracker</p>
						<div className="tracker-controls">
							<button type="button" onClick={() => goToStep(-1)} disabled={currentStepIndex === 0}>
								Prev
							</button>
							<span>
								Step {currentStepIndex + 1} / {selectedRecipe.steps.length}
							</span>
							<button
								type="button"
								onClick={() => goToStep(1)}
								disabled={currentStepIndex === selectedRecipe.steps.length - 1}
							>
								Next
							</button>
						</div>
					</header>
					<ol className="step-list">
						{selectedRecipe.steps.map((step, index) => {
							const state = index === currentStepIndex ? "is-active" : index > currentStepIndex ? "is-upcoming" : "is-complete";
							return (
								<li key={step.id} className={state}>
									<div className="step-index">{index + 1}</div>
									<div>
										<p>{step.label}</p>
										{step.tip && <small>{step.tip}</small>}
										{step.duration && <span className="duration">{step.duration}</span>}
									</div>
								</li>
							);
						})}
					</ol>
				</section>
			)}
			<section className="panel chat-panel">
				<header>
					<p className="eyebrow">Chat</p>
					<h3>Questions & recommendations</h3>
				</header>
				<div className="conversation-box">
					{conversation.length ? (
						<ol className="conversation-feed">
							{conversation.map((entry) => (
								<li key={entry.id} className={`chat-row ${entry.role}`} data-role={entry.role}>
									<span>{entry.role === "user" ? "You" : "Chef"}</span>
									<p>{entry.content}</p>
								</li>
							))}
						</ol>
					) : (
						<p className="muted">Ask anything about pantry finds or get a suggestion.</p>
					)}
				</div>
				<form className="chat-form" onSubmit={handleChatSubmit}>
					<input
						type="text"
						placeholder="Ask for a recommendation or cooking tip"
						value={chatInput}
						onChange={(event) => setChatInput(event.target.value)}
					/>
					<button type="submit">Send</button>
				</form>
			</section>
			{toast && <div className="toast">{toast}</div>}
		</div>
	);
}

export default App;
