export function EatingBurst({ amount }: { amount: number }) {
  return <div className="burst">+{amount.toFixed(0)} 🍴</div>;
}
