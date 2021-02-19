import Fuse from 'fuse.js';

import foodIndex from './food-index.json';
import foodList from './food.json';

const index = Fuse.parseIndex(foodIndex);
const food = new Fuse<string>(foodList as string[], {}, index);

export default food;
