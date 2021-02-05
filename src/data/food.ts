import fruits from './fruits.json';
import vegetables from './vegetables.json';
import condiments from './condiments.json';

const food: string[] = [
  ...new Set([...fruits, ...vegetables, ...condiments].map(titleize)),
];

function titleize(input: string) {
  return input.toLowerCase().replace(/(?:^|\s|-)\S/g, (x) => x.toUpperCase());
}

console.log(food.length);

export default food;
