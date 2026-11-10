/**
 * Name to forward for a paid pickup/delivery line.
 *
 * Relational order_items rows do not store the label the customer bought.
 * That label is on the order snapshot (orders.order_items jsonb: `name`).
 * A products(name) embed can also miss newer product ids, and a select that
 * embeds order_items(...) can collide with the jsonb column of the same name.
 *
 * Prefer the order's own item data. Never return the bare word "Product"
 * when any real name, or at least a product id, is available.
 */

const PLACEHOLDER_NAMES = new Set(['product']);

function cleanName(value) {
  if (typeof value !== 'string') return '';
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase())) return '';
  return name;
}

export function purchasedOrderItems(value) {
  return asItemArray(value);
}

function asItemArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function productIdOf(row) {
  if (!row || typeof row !== 'object') return null;
  const id = row.product_id ?? row.productId;
  if (id == null || String(id).trim() === '') return null;
  return id;
}

function sizeOf(row) {
  if (!row || typeof row !== 'object') return '';
  return String(row.size_option ?? row.sizeOption ?? row.size ?? '').trim();
}

function directName(row) {
  if (!row || typeof row !== 'object') return '';
  return (
    cleanName(row.name) ||
    cleanName(row.product_name) ||
    cleanName(row.productName) ||
    cleanName(row.display_title) ||
    cleanName(row.displayTitle)
  );
}

function joinedName(row) {
  const products = row?.products;
  const product = Array.isArray(products) ? products[0] : products;
  return directName(product);
}

function sameId(left, right) {
  return left != null && right != null && String(left) === String(right);
}

function sameSize(left, right) {
  return left !== '' && right !== '' && left.toLowerCase() === right.toLowerCase();
}

function matchSnapshot(item, snapshots, index) {
  const list = asItemArray(snapshots);
  if (!list.length) return null;

  const productId = productIdOf(item);
  const size = sizeOf(item);
  if (productId != null) {
    const sameProduct = list.filter((row) => sameId(productIdOf(row), productId));
    if (size) {
      const exact = sameProduct.find((row) => sameSize(sizeOf(row), size) && directName(row));
      if (exact) return exact;
      const exactAny = sameProduct.find((row) => sameSize(sizeOf(row), size));
      if (exactAny) return exactAny;
    }
    return sameProduct.find((row) => directName(row)) || sameProduct[0] || null;
  }

  if (Number.isInteger(index) && list[index]) return list[index];
  return list.length === 1 ? list[0] : null;
}

export function resolvePickupProductName(item, snapshots, index = 0) {
  const own = directName(item);
  if (own) return own;

  const snapshot = matchSnapshot(item, snapshots, index);
  const purchased = directName(snapshot);
  if (purchased) return purchased;

  const catalog = joinedName(item) || joinedName(snapshot);
  if (catalog) return catalog;

  const id = productIdOf(item) ?? productIdOf(snapshot);
  if (id != null) return `Product #${id}`;
  return 'Product';
}
