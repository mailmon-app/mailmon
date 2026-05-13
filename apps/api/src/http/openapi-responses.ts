import {
  PublicConnectSessionResourceSchema,
  PublicCreatedWebhookEndpointResourceSchema,
  PublicListResourceSchema,
  PublicMailboxObservabilitySnapshotResourceSchema,
  PublicMailboxResourceSchema,
  PublicMailboxSyncRunInspectionResourceSchema,
  PublicMessageResourceSchema,
  PublicProblemDetailsSchema,
  PublicReplayResourceSchema,
  PublicThreadListItemResourceSchema,
  PublicThreadResourceSchema,
  PublicWebhookEndpointSubscriptionResourceSchema,
} from "@mailmon/core";

import { toOpenApiJsonSchema } from "./validation.js";

export const jsonResponse = (description: string, schema: object) => {
  return {
    description,
    content: {
      "application/json": {
        schema,
      },
    },
  } as const;
};

export const connectSessionSchema = toOpenApiJsonSchema(PublicConnectSessionResourceSchema);
export const createdWebhookEndpointSchema = toOpenApiJsonSchema(
  PublicCreatedWebhookEndpointResourceSchema,
);
export const webhookEndpointSubscriptionListSchema = toOpenApiJsonSchema(
  PublicListResourceSchema(PublicWebhookEndpointSubscriptionResourceSchema),
);
export const mailboxSchema = toOpenApiJsonSchema(PublicMailboxResourceSchema);
export const syncRunListSchema = toOpenApiJsonSchema(
  PublicListResourceSchema(PublicMailboxSyncRunInspectionResourceSchema),
);
export const mailboxObservabilitySchema = toOpenApiJsonSchema(
  PublicMailboxObservabilitySnapshotResourceSchema,
);
export const replaySchema = toOpenApiJsonSchema(PublicReplayResourceSchema);
export const messageSchema = toOpenApiJsonSchema(PublicMessageResourceSchema);
export const messageListSchema = toOpenApiJsonSchema(
  PublicListResourceSchema(PublicMessageResourceSchema),
);
export const threadListItemListSchema = toOpenApiJsonSchema(
  PublicListResourceSchema(PublicThreadListItemResourceSchema),
);
export const threadSchema = toOpenApiJsonSchema(PublicThreadResourceSchema);

export const problemResponse = (description: string) =>
  jsonResponse(description, toOpenApiJsonSchema(PublicProblemDetailsSchema));

export const pathParameter = (name: string) => {
  return {
    in: "path",
    name,
    required: true,
    schema: { type: "string", minLength: 1 },
  } as const;
};
