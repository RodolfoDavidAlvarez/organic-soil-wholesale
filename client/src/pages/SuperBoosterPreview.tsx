import LaunchProductDetail, { type LaunchProduct } from './LaunchProductDetail';

// Preparation only: loaded exclusively through the development-only preview route.
const superBooster: LaunchProduct = {
  name: 'Super Booster', type: 'Organic Concentrate', subtitle: 'Concentrated soil amendment', slug: 'superbooster', draft: true,
  description: 'An organic concentrate for enriching existing soil in vegetable beds, fruit plantings and container mixes.',
  image: '/images/optimized/concentrated-organic-amendment-fertilizer-product-look.jpg',
  imageAlt: 'Super Booster concentrated soil amendment texture',
  includes: ['Compost', 'Worm castings', 'Biochar', 'Kelp meal', 'Zeolite'], benefits: [],
  ingredients: 'Chicken compost, compost, worm castings, SKM, zeolite, biochar, kelp meal, azomite, cyanobacteria and mycorrhizae.',
  uses: 'A soil amendment for fruit trees, vegetable beds and specialty crops. Mix into soil; not a standalone potting soil.',
  sizes: [],
};
export default function SuperBoosterPreview() { return <LaunchProductDetail product={superBooster} />; }
