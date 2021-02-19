const Fuse = require('fuse.js');
const fs = require('fs/promises');

const fruits = require('../data/fruits.json');
const vegetables = require('../data/vegetables.json');
const condiments = require('../data/condiments.json');
const misc = require('../data/misc.json');

const food = [
  ...new Set([...fruits, ...vegetables, ...condiments, ...misc].map(titleize)),
];

function titleize(input) {
  return input.toLowerCase().replace(/(?:^|\s|-)\S/g, (x) => x.toUpperCase());
}

const foodIndex = Fuse.createIndex([], food);

fs.writeFile('src/data/food.json', JSON.stringify(food));
fs.writeFile('src/data/food-index.json', JSON.stringify(foodIndex.toJSON()));
