const kitchenIdPattern = /^kitchen-(\d+)$/i;

const kitchenDescriptionTranslations: Record<string, string> = {
  "Bakery & Hot Line": "Forno, padaria e linha quente",
  "Cold line": "Linha fria",
  "Drinks & Cold Line": "Bebidas e linha fria",
  "Hot line": "Linha quente",
};

function translateKitchenToken(match: string) {
  return match[0] === match[0].toUpperCase() ? "Cozinha" : "cozinha";
}

export function localizeKitchenLabel(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return trimmedValue;
  }

  const kitchenIdMatch = trimmedValue.match(kitchenIdPattern);

  if (kitchenIdMatch) {
    return `Cozinha ${kitchenIdMatch[1]}`;
  }

  return trimmedValue.replace(/\bkitchen\b/gi, translateKitchenToken);
}

export function localizeKitchenDescription(value: string) {
  return kitchenDescriptionTranslations[value] ?? localizeKitchenLabel(value);
}
