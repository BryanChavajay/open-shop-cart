/** Resultado paginado genérico. Las páginas comienzan en 1. */
export interface PaginatedReadModel<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
