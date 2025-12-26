import type { FormEvent, ReactElement } from "react";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import ChatSidebar from "./ChatSidebar";
import { useRoomSocket } from "./hooks/useRoomSocket";
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

const promptSuggestions = [
	"Smoky vegan stew for two",
	"High-protein meal prep with salmon",
	"One-pot pasta with crunchy toppings",
];

function App(): ReactElement {
	const [viewMode, setViewMode] = useState<"idle" | "active">("idle");
	const [prompt, setPrompt] = useState<string>("");
	const [activeTab, setActiveTab] = useState<LeftTab>("history");
	const [recipes, setRecipes] = useState<RecipePlan[]>([]);
	const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
	const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
	const [hoveredIngredientId, setHoveredIngredientId] = useState<string | null>(
		null
	);
	const [toast, setToast] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [history, setHistory] = useState<ListEntry[]>([]);
	const [favorites, setFavorites] = useState<ListEntry[]>([]);
	const [chatInput, setChatInput] = useState<string>("");
	const [isAccountMenuOpen, setIsAccountMenuOpen] = useState<boolean>(false);
	const [roomId] = useState<string>(() => {
		if (typeof window === "undefined") {
			return "atelier-demo";
		}
		const params = new URLSearchParams(window.location.search);
		return params.get("room") ?? "atelier-demo";
	});

	const accountMenuRef = useRef<HTMLDivElement | null>(null);

	const selectedRecipe = useMemo<RecipePlan | null>(() => {
		if (recipes.length === 0) {
			return null;
		}
		if (!selectedRecipeId) {
			return recipes[0];
		}
		return (
			recipes.find((recipe) => recipe.id === selectedRecipeId) ?? recipes[0]
		);
	}, [recipes, selectedRecipeId]);

	useEffect(() => {
		if (!selectedRecipe) {
			setCurrentStepIndex(0);
			return;
		}
		setCurrentStepIndex(0);
	}, [selectedRecipe]);

	useEffect(() => {
		const handleClickAway = (event: MouseEvent) => {
			if (
				accountMenuRef.current &&
				!accountMenuRef.current.contains(event.target as Node)
			) {
				setIsAccountMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickAway);
		return () => document.removeEventListener("mousedown", handleClickAway);
	}, []);

	const listEntries = useMemo(() => {
		return activeTab === "history" ? history : favorites;
	}, [activeTab, favorites, history]);

	const makeId = (prefix: string) =>
		`${prefix}-${Date.now().toString(36)}-${Math.random()
			.toString(36)
			.slice(2, 6)}`;

	const showToast = useCallback((message: string) => {
		setToast(message);
		window.setTimeout(() => {
			setToast(null);
		}, 2200);
	}, []);

	const requestRecipePlan = useCallback(
		async (promptText: string): Promise<RecipePlan> => {
			const configuredBase = (
				import.meta.env.VITE_API_BASE_URL as string | undefined
			)?.replace(/\/$/, "");
			const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
			const apiUrl = configuredBase
				? `${configuredBase}/api/recipes`
				: basePath
				? `${basePath}/api/recipes`
				: "/api/recipes";
			const response = await fetch(apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ prompt: promptText }),
			});
			if (!response.ok) {
				const errorText = await response.text().catch(() => "");
				throw new Error(`Recipe API error ${response.status}: ${errorText}`);
			}
			const data = (await response.json()) as { recipe?: RecipePlan };
			if (!data.recipe) {
				throw new Error("Recipe payload missing");
			}
			return data.recipe;
		},
		[]
	);

	const generateRecipeFromPrompt = useCallback(
		async (input: string, options?: { trackHistory?: boolean }) => {
			const trimmed = input.trim();
			if (!trimmed) {
				return null;
			}
			setIsGenerating(true);
			try {
				const recipe = await requestRecipePlan(trimmed);
				setRecipes((prev) => {
					const filtered = prev.filter((entry) => entry.id !== recipe.id);
					return [recipe, ...filtered];
				});
				setSelectedRecipeId(recipe.id);
				setViewMode("active");
				setHoveredIngredientId(null);
				if (options?.trackHistory ?? true) {
					setHistory((prev) => {
						const remaining = prev.filter(
							(entry) => entry.recipeId !== recipe.id
						);
						const newEntry: ListEntry = {
							id: makeId("hist"),
							recipeId: recipe.id,
							title: recipe.title,
							summary: trimmed,
							timeLabel: "Just now",
							tags: recipe.tags.slice(0, 2),
						};
						return [newEntry, ...remaining];
					});
				}
				return recipe;
			} catch (error) {
				console.error(error);
				showToast("Unable to generate recipe");
				return null;
			} finally {
				setIsGenerating(false);
			}
		},
		[requestRecipePlan, showToast]
	);

	const {
		conversation,
		status: chatStatus,
		sendUserMessage,
		clearConversation,
		reconnect: reconnectChat,
	} = useRoomSocket(roomId, {
		displayName: "Alex Gardner",
		onError: showToast,
	});

	const handlePromptSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!prompt.trim() || isGenerating) {
			return;
		}
		await generateRecipeFromPrompt(prompt, { trackHistory: true });
		setPrompt("");
	};

	type SelectOptions = {
		trackHistory?: boolean;
	};

	const handleSelectRecipe = (
		recipeId: string,
		userMessage?: string,
		options?: SelectOptions
	) => {
		const nextRecipe = recipes.find((recipe) => recipe.id === recipeId);
		if (!nextRecipe) {
			showToast("Recipe unavailable");
			return;
		}
		setSelectedRecipeId(nextRecipe.id);
		setViewMode("active");
		setHoveredIngredientId(null);
		const trimmedMessage = userMessage?.trim();
		if (trimmedMessage && options?.trackHistory) {
			setHistory((prev) => {
				const remaining = prev.filter(
					(entry) => entry.recipeId !== nextRecipe.id
				);
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
		const recipeToCopy = selectedRecipe;
		if (!recipeToCopy) {
			showToast("No recipe to copy");
			return;
		}
		const compiled = [
			recipeToCopy.title,
			recipeToCopy.summary,
			"Ingredients:",
			...recipeToCopy.ingredients.map(
				(ingredient) => `- ${ingredient.amount} ${ingredient.label}`
			),
			"Steps:",
			...recipeToCopy.steps.map((step, index) => `${index + 1}. ${step.label}`),
		].join("\n");
		try {
			await navigator.clipboard.writeText(compiled);
			showToast("Plan copied");
		} catch {
			showToast("Clipboard unavailable");
		}
	};

	const handleSavePlan = () => {
		const recipeToSave = selectedRecipe;
		if (!recipeToSave) {
			showToast("No recipe to save");
			return;
		}
		setIsSaving(true);
		window.setTimeout(() => {
			setIsSaving(false);
			setFavorites((prev) => {
				const alreadySaved = prev.some(
					(entry) => entry.recipeId === recipeToSave.id
				);
				if (alreadySaved) {
					showToast("Already in favorites");
					return prev;
				}
				const newEntry: ListEntry = {
					id: makeId("fav"),
					recipeId: recipeToSave.id,
					title: recipeToSave.title,
					summary: recipeToSave.summary,
					timeLabel: "Just now",
					tags: recipeToSave.tags.slice(0, 2),
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
		clearConversation();
	};

	const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!chatInput.trim()) {
			return;
		}
		const didSend = sendUserMessage(chatInput);
		if (didSend) {
			setChatInput("");
		}
	};

	const goToStep = (delta: number) => {
		if (!selectedRecipe) {
			return;
		}
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
							<button
								type="button"
								onClick={() => handleAccountAction("profile")}
								role="menuitem"
							>
								Profile
							</button>
							<button
								type="button"
								onClick={() => handleAccountAction("settings")}
								role="menuitem"
							>
								Account settings
							</button>
							<button
								type="button"
								onClick={() => handleAccountAction("logout")}
								role="menuitem"
								className="danger"
							>
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
			</aside>
			<section className="panel main-panel">
				{viewMode === "idle" ? (
					<div className="prompt-panel">
						<p className="eyebrow">Recipe chatbot</p>
						<h1>What would you like to make today?</h1>
						<p className="lede">
							Describe cravings, pantry finds, or dietary vibes and I will draft
							recipes, timing, and a step plan.
						</p>
						<form className="prompt-form" onSubmit={handlePromptSubmit}>
							<input
								type="text"
								placeholder="e.g., Cozy vegan ramen with crispy toppings"
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
							/>
							<button type="submit" disabled={isGenerating}>
								{isGenerating ? "Generating…" : "Generate plan"}
							</button>
						</form>
						<div className="prompt-suggestions">
							{promptSuggestions.map((suggestion) => (
								<button
									key={suggestion}
									type="button"
									onClick={() => {
										setPrompt(suggestion);
										void generateRecipeFromPrompt(suggestion, {
											trackHistory: true,
										});
									}}
									disabled={isGenerating}
								>
									{suggestion}
								</button>
							))}
						</div>
					</div>
				) : selectedRecipe ? (
					<div className="recipe-stage">
						<header className="stage-head">
							<div>
								<p className="eyebrow">Chef's plan</p>
								<h1>{selectedRecipe.title}</h1>
								<p className="lede">{selectedRecipe.summary}</p>
							</div>
							<div
								className="action-toolbar"
								role="toolbar"
								aria-label="recipe actions"
							>
								<button
									type="button"
									onClick={handleCopyPlan}
									disabled={!selectedRecipe}
								>
									Copy
								</button>
								<button
									type="button"
									onClick={handleSavePlan}
									disabled={!selectedRecipe || isSaving}
								>
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
												onMouseEnter={() =>
													setHoveredIngredientId(ingredient.id)
												}
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
												<div
													className={`ingredient-detail ${
														isHovered ? "is-visible" : ""
													}`}
												>
													<p className="eyebrow">Steps queued</p>
													{ingredientSteps.length ? (
														<ol>
															{ingredientSteps.map((step) => (
																<li key={step.id}>{step.label}</li>
															))}
														</ol>
													) : (
														<p className="muted">
															No specific steps queued just yet.
														</p>
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
											className={
												recipe.id === selectedRecipeId ? "is-active" : undefined
											}
											onClick={() =>
												handleSelectRecipe(
													recipe.id,
													`Switch to ${recipe.title}`,
													{ trackHistory: false }
												)
											}
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
				) : (
					<div className="recipe-stage empty">
						<p className="muted">Generate a recipe to begin cooking.</p>
					</div>
				)}
			</section>
			{viewMode === "active" && selectedRecipe && (
				<section className="panel tracker-panel">
					<header>
						<p className="eyebrow">Step tracker</p>
						<div className="tracker-controls">
							<button
								type="button"
								onClick={() => goToStep(-1)}
								disabled={currentStepIndex === 0}
							>
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
							const state =
								index === currentStepIndex
									? "is-active"
									: index > currentStepIndex
									? "is-upcoming"
									: "is-complete";
							return (
								<li key={step.id} className={state}>
									<div className="step-index">{index + 1}</div>
									<div>
										<p>{step.label}</p>
										{step.tip && <small>{step.tip}</small>}
										{step.duration && (
											<span className="duration">{step.duration}</span>
										)}
									</div>
								</li>
							);
						})}
					</ol>
				</section>
			)}
			<ChatSidebar
				conversation={conversation}
				chatInput={chatInput}
				onChatInputChange={setChatInput}
				onSubmit={handleChatSubmit}
				connectionStatus={chatStatus}
				roomId={roomId}
				onReconnect={reconnectChat}
			/>
			{toast && <div className="toast">{toast}</div>}
		</div>
	);
}

export default App;
