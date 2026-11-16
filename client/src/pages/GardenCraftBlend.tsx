import LaunchProductDetail, { type LaunchProduct } from './LaunchProductDetail';

export const gardenCraft: LaunchProduct = {
  name: 'Garden Craft Blend', type: 'Potting soil · Garden soil mix', subtitle: 'Our Signature Blend', slug: 'garden-craft-blend',
  description: 'Premium mix for raised beds & containers. Ready to use. Just open the bag and plant.',
  image: '/images/garden-craft/garden-craft-1-5-cu-ft.webp',
  imageAlt: 'Garden Craft Blend 1.5 cu ft bag mockup with green Soil Seed & Water label',
  imageCaption: '1.5 cu ft bag shown. AI-generated packaging preview; final packaging may vary.',
  includes: ['Clean wood fiber', 'Organic dairy compost', 'Coco peat', 'Worm castings', 'Super Booster organic concentrate'],
  benefits: ['Ready to use', 'Beds & containers', 'Rich in organic matter', 'Enhanced drainage'],
  ingredients: 'Clean wood fiber, organic dairy compost, coco peat, worm castings, Super Booster organic concentrate (chicken compost, SKM, zeolite, biochar, kelp meal, azomite, cyanobacteria, mycorrhizae).',
  uses: 'A complete planting mix for raised beds, containers and garden beds. Ideal for vegetables, herbs and flowers.',
  directions: 'Use Garden Craft Blend as a complete planting medium for container plants or raised beds. No need to mix with existing soil. Water thoroughly after planting.',
  safety: 'Avoid ingestion and contact with eyes. Keep out of reach of children.',
  sizes: [
    { label: '7.5 QT bag', detail: 'Small bag' },
    { label: '1.5 cu ft bag', detail: 'Individual bag' },
    { label: 'Pallet', detail: '30 × 1.5 cu ft bags' },
    { label: '2.2 cu yd tote', detail: 'Bulk bag' },
    { label: 'Dump truck', detail: 'Ask about delivery quantities' },
    { label: 'Truckload', detail: 'Ask about delivery quantities' },
  ],
};
export default function GardenCraftBlend() { return <LaunchProductDetail product={gardenCraft} />; }
