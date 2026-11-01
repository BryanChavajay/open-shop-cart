/** Category as exposed by the admin list/detail endpoints. */
export interface CategoryReadModel {
  /** Internal autoincremental identifier (e.g. to compose rows by trigger). */
  id: number;
  /** Public identifier (UUID v7). */
  publicId: string;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
  /** Number of non-deleted products in the category; null/undefined on plain list rows. */
  productCount?: number | null;
}
