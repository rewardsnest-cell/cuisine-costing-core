export type Step = "style" | "protein" | "dietary" | "service" | "extras" | "addons" | "tier" | "details" | "review";

export const STEPS: Step[] = ["style", "protein", "dietary", "service", "extras", "addons", "tier", "details", "review"];

export const MENU_STYLES = [
  { id: "meat", label: "Meat & Poultry", icon: "🥩", desc: "Prime cuts, poultry, and charcuterie" },
  { id: "seafood", label: "Seafood", icon: "🦐", desc: "Fresh fish, shellfish, and ocean delicacies" },
  { id: "vegetarian", label: "Vegetarian", icon: "🥗", desc: "Plant-forward dishes with rich flavors" },
  { id: "mixed", label: "Mixed Menu", icon: "🍽️", desc: "The best of everything for all guests" },
];

export const PROTEINS: Record<string, string[]> = {
  meat: ["Chicken", "Beef", "Pork", "Lamb"],
  seafood: ["Fish", "Shrimp", "Crab", "Lobster"],
  vegetarian: ["Tofu", "Mushroom", "Eggplant", "Cauliflower"],
  mixed: ["Chicken", "Beef", "Fish", "Tofu"],
};

export const ALLERGIES = ["Gluten", "Dairy", "Nuts", "Shellfish", "Soy", "Eggs"];

export const SERVICE_STYLES = [
  { id: "buffet", label: "Buffet", icon: "🍴", desc: "Self-service stations with variety" },
  { id: "plated", label: "Plated Dinner", icon: "🍽️", desc: "Elegant multi-course table service" },
  { id: "family", label: "Family Style", icon: "🥘", desc: "Shared platters at each table" },
  { id: "cocktail", label: "Cocktail Reception", icon: "🥂", desc: "Passed hors d'oeuvres and small bites" },
];

export const SIDES_AND_EXTRAS = [
  { id: "appetizers", label: "Appetizer Course", price: 8, icon: "🥟" },
  { id: "salad", label: "Garden Salad", price: 5, icon: "🥗" },
  { id: "soup", label: "Seasonal Soup", price: 6, icon: "🍜" },
  { id: "bread", label: "Artisan Bread Basket", price: 4, icon: "🍞" },
  { id: "dessert", label: "Dessert Course", price: 10, icon: "🍰" },
  { id: "beverages", label: "Non-Alcoholic Beverages", price: 5, icon: "🥤" },
  { id: "coffee", label: "Coffee & Tea Service", price: 4, icon: "☕" },
];

export const ADDONS = [
  { id: "bar_basic", label: "Basic Bar Package", price: 15, icon: "🍺", desc: "Beer, wine, and soft drinks" },
  { id: "bar_premium", label: "Premium Bar Package", price: 28, icon: "🍸", desc: "Full liquor, craft cocktails, wine" },
  { id: "linens", label: "Premium Linens", price: 5, icon: "🧵", desc: "Upgraded tablecloths and napkins" },
  { id: "florals", label: "Floral Centerpieces", price: 12, icon: "💐", desc: "Fresh seasonal arrangements" },
  { id: "staff", label: "Extra Wait Staff", price: 8, icon: "👨‍🍳", desc: "Additional servers for faster service" },
  { id: "equipment", label: "Equipment Rental", price: 6, icon: "🪑", desc: "Chairs, tables, and tent setup" },
];

export const TIERS = [
  { id: "silver", label: "Silver", multiplier: 1, icon: "🥈", desc: "Quality catering at a great value", color: "border-muted-foreground" },
  { id: "gold", label: "Gold", multiplier: 1.35, icon: "🥇", desc: "Premium ingredients and elevated presentation", color: "border-primary" },
  { id: "platinum", label: "Platinum", multiplier: 1.75, icon: "💎", desc: "Luxury experience with top-tier everything", color: "border-accent" },
];

export const PRICE_PER_DISH = 35;

export interface QuoteSelections {
  style: string;
  proteins: string[];
  allergies: string[];
  serviceStyle: string;
  extras: string[];
  addons: string[];
  tier: string;
  guestCount: number;
  eventDate: string;
  eventType: string;
  clientName: string;
  clientEmail: string;
}

export const INITIAL_SELECTIONS: QuoteSelections = {
  style: "",
  proteins: [],
  allergies: [],
  serviceStyle: "",
  extras: [],
  addons: [],
  tier: "silver",
  guestCount: 50,
  eventDate: "",
  eventType: "",
  clientName: "",
  clientEmail: "",
};
