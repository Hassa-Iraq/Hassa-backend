import swaggerJsdoc from 'swagger-jsdoc';

export interface SwaggerOptions {
  serviceName: string;
  version?: string;
  description?: string;
  apiPaths?: string[];
  servers?: Array<{
    url: string;
    description?: string;
  }>;
}

/**
 * Creates Swagger/OpenAPI specification for a service
 */
export function createSwaggerSpec(options: SwaggerOptions): object {
  const {
    serviceName,
    version = '1.0.0',
    description = '',
    apiPaths = [],
    servers = [],
  } = options;

  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: `${serviceName} API`,
        version,
        description,
        contact: {
          name: 'Food Delivery Platform API Support',
        },
      },
      servers:
        servers.length > 0
          ? servers
          : [
              {
                url: 'http://localhost:3000',
                description: 'Local development server',
              },
            ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token obtained from /auth/login endpoint',
          },
        },
        schemas: {
          SuccessResponse: {
            type: 'object',
            properties: {
              success: {
                type: 'boolean',
                example: true,
              },
              message: {
                type: 'string',
                example: 'Success',
              },
              data: {
                type: 'object',
              },
            },
          },
          ErrorResponse: {
            type: 'object',
            properties: {
              success: {
                type: 'boolean',
                example: false,
              },
              message: {
                type: 'string',
                example: 'Error message',
              },
              error: {
                type: 'string',
                example: 'Detailed error information',
              },
            },
          },
          ValidationError: {
            type: 'object',
            properties: {
              success: {
                type: 'boolean',
                example: false,
              },
              message: {
                type: 'string',
                example: 'Validation failed',
              },
              errors: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: {
                      type: 'string',
                    },
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        },
      },
      tags: [],
    },
    apis: apiPaths,
  };

  return swaggerJsdoc(swaggerOptions);
}
