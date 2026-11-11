import type { Recipe } from '../src/model';

/** The gratin from the plan, in normalized (tree) order. */
export function gratin(): Recipe {
  return {
    prerequisites: ['Préchauffer le four à 180 °C'],
    ingredients: [
      { key: 'pdt', name: 'Pommes de terre', quantity: 1.5, unit: 'kg' },
      { key: 'ail', name: 'Ail (gousse)', quantity: 1, unit: 'pcs' },
      { key: 'beurre', name: 'Beurre', quantity: 20, unit: 'g' },
      { key: 'creme', name: 'Crème liquide', quantity: 500, unit: 'ml' },
      { key: 'lait', name: 'Lait', quantity: 250, unit: 'ml' },
      { key: 'sel', name: 'Sel' },
      { key: 'musc', name: 'Muscade' },
    ],
    steps: [
      { key: 'tranche', text: 'Éplucher, trancher finement', inputs: ['pdt'] },
      { key: 'plat', text: "Frotter le plat à l'ail, puis le beurrer", inputs: ['ail', 'beurre'] },
      { key: 'melange', text: 'Mélanger', inputs: ['creme', 'lait', 'sel', 'musc'] },
      { key: 'chaud', text: 'Porter à frémissement', inputs: ['melange'] },
      {
        key: 'monte',
        text: 'Disposer en couches dans le plat, napper de la crème chaude',
        inputs: ['tranche', 'plat', 'chaud'],
      },
      { key: 'cuisson', text: 'Cuire 1 h', inputs: ['monte'] },
    ],
  };
}
