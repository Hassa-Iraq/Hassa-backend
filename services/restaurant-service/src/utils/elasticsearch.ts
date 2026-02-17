import { Client, ClientOptions } from '@elastic/elasticsearch';
import config from '../config/index';
import { createLogger } from 'shared/logger/index';

const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

let esClient: Client | null = null;

/**
 * Get or create Elasticsearch client
 */
export function getElasticsearchClient(): Client {
  if (!esClient) {
    const clientOptions: ClientOptions = {
      node: config.ELASTICSEARCH_URL || 'http://localhost:9200',
    };

    // Add authentication if provided
    if (config.ELASTICSEARCH_USERNAME && config.ELASTICSEARCH_PASSWORD) {
      clientOptions.auth = {
        username: config.ELASTICSEARCH_USERNAME,
        password: config.ELASTICSEARCH_PASSWORD,
      };
    }

    esClient = new Client(clientOptions);

    // Test connection (non-blocking)
    esClient.ping()
      .then(() => {
        logger.info('Elasticsearch client connected');
      })
      .catch((err) => {
        logger.warn({ error: err.message }, 'Elasticsearch connection test failed (will retry on first use)');
      });
  }

  return esClient;
}

/**
 * Retry helper for Elasticsearch operations
 */
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        logger.warn({ attempt, maxRetries, error: error.message }, 'Elasticsearch operation failed, retrying...');
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
}

/**
 * Initialize Elasticsearch indices with retry logic
 */
export async function initializeIndices(): Promise<void> {
  const client = getElasticsearchClient();

  try {
    // Test connection first
    await retryOperation(async () => {
      await client.ping();
      logger.info('Elasticsearch connection verified');
    }, 3, 1000);

    // Create restaurants index
    const restaurantsIndexExists = await retryOperation(async () => {
      return await client.indices.exists({ index: 'restaurants' });
    });

    if (!restaurantsIndexExists) {
      await retryOperation(async () => {
        await client.indices.create({
          index: 'restaurants',
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                user_id: { type: 'keyword' },
                name: { type: 'text', analyzer: 'standard' },
                description: { type: 'text', analyzer: 'standard' },
                address: { type: 'text', analyzer: 'standard' },
                phone: { type: 'keyword' },
                email: { type: 'keyword' },
                is_active: { type: 'boolean' },
                is_blocked: { type: 'boolean' },
                is_open: { type: 'boolean' },
                created_at: { type: 'date' },
                updated_at: { type: 'date' },
              },
            },
          },
        });
        logger.info('Created restaurants index');
      });
    } else {
      logger.debug('Restaurants index already exists');
    }

    // Create menu_items index
    const menuItemsIndexExists = await retryOperation(async () => {
      return await client.indices.exists({ index: 'menu_items' });
    });

    if (!menuItemsIndexExists) {
      await retryOperation(async () => {
        await client.indices.create({
          index: 'menu_items',
          body: {
            mappings: {
              properties: {
                id: { type: 'keyword' },
                restaurant_id: { type: 'keyword' },
                category_id: { type: 'keyword' },
                name: { type: 'text', analyzer: 'standard' },
                description: { type: 'text', analyzer: 'standard' },
                price: { type: 'float' },
                image_url: { type: 'keyword' },
                is_available: { type: 'boolean' },
                prep_time_minutes: { type: 'integer' },
                discount_type: { type: 'keyword' },
                discount_value: { type: 'float' },
                max_purchase_quantity: { type: 'integer' },
                stock_type: { type: 'keyword' },
                stock: { type: 'integer' },
                search_tags: { type: 'text', analyzer: 'standard' },
                available_start_time: { type: 'keyword' },
                available_end_time: { type: 'keyword' },
                food_type: { type: 'keyword' },
                created_at: { type: 'date' },
                updated_at: { type: 'date' },
              },
            },
          },
        });
        logger.info('Created menu_items index');
      });
    } else {
      logger.debug('Menu items index already exists');
    }

    logger.info('Elasticsearch indices initialized successfully');
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to initialize Elasticsearch indices after retries');
    // Don't throw - allow service to start even if Elasticsearch is unavailable
    // Search operations will handle errors gracefully
  }
}

/**
 * Index a restaurant in Elasticsearch with retry
 */
export async function indexRestaurant(restaurant: any): Promise<void> {
  const client = getElasticsearchClient();

  try {
    await retryOperation(async () => {
      await client.index({
        index: 'restaurants',
        id: restaurant.id,
        body: {
          id: restaurant.id,
          name: restaurant.name,
          description: restaurant.description || '',
          address: restaurant.address || '',
          phone: restaurant.phone || '',
          email: restaurant.email || '',
          is_active: restaurant.is_active,
          is_blocked: restaurant.is_blocked || false,
          is_open: restaurant.is_open,
          created_at: restaurant.created_at,
          updated_at: restaurant.updated_at,
        },
      });
    }, 2, 500);
    logger.debug({ restaurantId: restaurant.id }, 'Indexed restaurant in Elasticsearch');
  } catch (error: any) {
    logger.error({ error: error.message, restaurantId: restaurant.id }, 'Failed to index restaurant after retries');
    // Don't throw - allow operation to continue even if indexing fails
  }
}

/**
 * Index a menu item in Elasticsearch with retry
 */
export async function indexMenuItem(menuItem: any): Promise<void> {
  const client = getElasticsearchClient();

  try {
    await retryOperation(async () => {
      await client.index({
        index: 'menu_items',
        id: menuItem.id,
        body: {
          id: menuItem.id,
          restaurant_id: menuItem.restaurant_id,
          category_id: menuItem.category_id || null,
          name: menuItem.name,
          description: menuItem.description || '',
          price: parseFloat(menuItem.price),
          image_url: menuItem.image_url || '',
          is_available: menuItem.is_available,
          prep_time_minutes: menuItem.prep_time_minutes || null,
          discount_type: menuItem.discount_type || null,
          discount_value: menuItem.discount_value ? parseFloat(menuItem.discount_value) : null,
          max_purchase_quantity: menuItem.max_purchase_quantity || null,
          stock_type: menuItem.stock_type || 'unlimited',
          stock: menuItem.stock || null,
          search_tags: menuItem.search_tags || '',
          available_start_time: menuItem.available_start_time || null,
          available_end_time: menuItem.available_end_time || null,
          food_type: menuItem.food_type || 'veg',
          created_at: menuItem.created_at,
          updated_at: menuItem.updated_at,
        },
      });
    }, 2, 500);
    logger.debug({ menuItemId: menuItem.id }, 'Indexed menu item in Elasticsearch');
  } catch (error: any) {
    logger.error({ error: error.message, menuItemId: menuItem.id }, 'Failed to index menu item after retries');
    // Don't throw - allow operation to continue even if indexing fails
  }
}

/**
 * Delete a restaurant from Elasticsearch
 */
export async function deleteRestaurantFromIndex(restaurantId: string): Promise<void> {
  const client = getElasticsearchClient();

  try {
    await client.delete({
      index: 'restaurants',
      id: restaurantId,
    });
    logger.debug({ restaurantId }, 'Deleted restaurant from Elasticsearch');
  } catch (error: any) {
    // Ignore 404 errors (document doesn't exist)
    if (error.meta?.statusCode !== 404) {
      logger.error({ error: error.message, restaurantId }, 'Failed to delete restaurant from Elasticsearch');
    }
  }
}

/**
 * Delete a menu item from Elasticsearch
 */
export async function deleteMenuItemFromIndex(menuItemId: string): Promise<void> {
  const client = getElasticsearchClient();

  try {
    await client.delete({
      index: 'menu_items',
      id: menuItemId,
    });
    logger.debug({ menuItemId }, 'Deleted menu item from Elasticsearch');
  } catch (error: any) {
    // Ignore 404 errors (document doesn't exist)
    if (error.meta?.statusCode !== 404) {
      logger.error({ error: error.message, menuItemId }, 'Failed to delete menu item from Elasticsearch');
    }
  }
}

/**
 * Search restaurants in Elasticsearch
 */
export async function searchRestaurants(query: string, limit: number = 20, offset: number = 0): Promise<any> {
  const client = getElasticsearchClient();

  try {
    const response = await client.search({
      index: 'restaurants',
      body: {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['name^3', 'description', 'address'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: [
              { term: { is_active: true } },
              { term: { is_blocked: false } },
              { term: { is_open: true } },
            ],
          },
        },
        size: limit,
        from: offset,
      },
    });

    // Map email to contact_email in search results
    return {
      items: response.hits.hits.map((hit: any) => {
        const source = hit._source;
        if (source.email !== undefined) {
          const { email, ...rest } = source;
          return { ...rest, contact_email: email || null };
        }
        return source;
      }),
      total: typeof response.hits.total === 'number' 
        ? response.hits.total 
        : response.hits.total?.value || 0,
    };
  } catch (error: any) {
    logger.error({ error: error.message, query }, 'Failed to search restaurants');
    return { items: [], total: 0 };
  }
}

/**
 * Search menu items in Elasticsearch
 */
export async function searchMenuItems(
  query: string,
  restaurantId?: string,
  limit: number = 20,
  offset: number = 0
): Promise<any> {
  const client = getElasticsearchClient();

  try {
    const mustClauses: any[] = [
      {
        multi_match: {
          query,
          fields: ['name^3', 'description', 'search_tags^2'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      },
    ];

    const filterClauses: any[] = [
      { term: { is_available: true } },
    ];

    if (restaurantId) {
      filterClauses.push({ term: { restaurant_id: restaurantId } });
    }

    const response = await client.search({
      index: 'menu_items',
      body: {
        query: {
          bool: {
            must: mustClauses,
            filter: filterClauses,
          },
        },
        size: limit,
        from: offset,
      },
    });

    return {
      items: response.hits.hits.map((hit: any) => hit._source),
      total: typeof response.hits.total === 'number' 
        ? response.hits.total 
        : response.hits.total?.value || 0,
    };
  } catch (error: any) {
    logger.error({ error: error.message, query, restaurantId }, 'Failed to search menu items');
    return { items: [], total: 0 };
  }
}

export default {
  getElasticsearchClient,
  initializeIndices,
  indexRestaurant,
  indexMenuItem,
  deleteRestaurantFromIndex,
  deleteMenuItemFromIndex,
  searchRestaurants,
  searchMenuItems,
};
