import { CfnOutput, Duration } from "@aws-cdk/core";
import { FromSchema } from "json-schema-to-ts";
import { Queue as AwsQueue } from "@aws-cdk/aws-sqs";
import type { Serverless } from "../types/serverless";
import { PolicyStatement } from "../Stack";
import { AwsComponent } from "./AwsComponent";

export const QUEUE_DEFINITION = {
    type: "object",
    properties: {
        type: { const: "queue" },
        worker: {
            type: "object",
            properties: {
                handler: { type: "string" },
                timeout: { type: "number" },
            },
            required: ["handler"],
            additionalProperties: true,
        },
        maxRetries: { type: "number" },
        alarm: { type: "string" },
        batchSize: {
            type: "number",
            minimum: 1,
            maximum: 10,
        },
    },
    additionalProperties: false,
    required: ["worker"],
} as const;

export class Queue extends AwsComponent<typeof QUEUE_DEFINITION> {
    private readonly queue: AwsQueue;
    private readonly queueArnOutput: CfnOutput;
    private readonly queueUrlOutput: CfnOutput;

    constructor(serverless: Serverless, id: string, configuration: FromSchema<typeof QUEUE_DEFINITION>) {
        super(serverless, id, QUEUE_DEFINITION, configuration);

        // The default function timeout is 6 seconds in the Serverless Framework
        const functionTimeout = configuration.worker.timeout ?? 6;

        const maxRetries = configuration.maxRetries ?? 3;

        const dlq = new AwsQueue(this.stack, "Dlq", {
            queueName: this.stack.stackName + "-" + id + "-dlq",
            // 14 days is the maximum, we want to keep these messages for as long as possible
            retentionPeriod: Duration.days(14),
        });

        this.queue = new AwsQueue(this.stack, "Queue", {
            queueName: this.stack.stackName + "-" + id,
            // This should be 6 times the lambda function's timeout
            // See https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
            visibilityTimeout: Duration.seconds(functionTimeout * 6),
            deadLetterQueue: {
                maxReceiveCount: maxRetries,
                queue: dlq,
            },
        });
        // ...

        // CloudFormation outputs
        this.queueArnOutput = new CfnOutput(this.stack, "QueueName", {
            description: `Name of the "${id}" SQS queue.`,
            value: this.queue.queueName,
        });
        this.queueUrlOutput = new CfnOutput(this.stack, "QueueUrl", {
            description: `URL of the "${id}" SQS queue.`,
            value: this.queue.queueUrl,
        });

        this.appendFunctions();
    }

    // TODO integrate in the stack
    appendFunctions(): void {
        // The default batch size is 1
        const batchSize = this.configuration.batchSize ?? 1;

        // Override events for the worker
        this.configuration.worker.events = [
            // Subscribe the worker to the SQS queue
            {
                sqs: {
                    arn: this.referenceQueueArn(),
                    batchSize: batchSize,
                    // TODO add setting
                    maximumBatchingWindow: 60,
                },
            },
        ];
        Object.assign(this.serverless.service.functions, {
            [`${this.id}Worker`]: this.configuration.worker,
        });
    }

    permissions(): PolicyStatement[] {
        return [new PolicyStatement("sqs:SendMessage", [this.referenceQueueArn()])];
    }

    async infoOutput(): Promise<string | undefined> {
        return await this.getQueueUrl();
    }

    variables(): Record<string, () => Promise<string | undefined>> {
        return {
            queueArn: this.getQueueArn.bind(this),
            queueUrl: this.getQueueUrl.bind(this),
        };
    }

    referenceQueueArn(): Record<string, unknown> {
        return this.getCloudFormationReference(this.queue.queueArn);
    }

    async getQueueArn(): Promise<string | undefined> {
        return this.getOutputValue(this.queueArnOutput);
    }

    async getQueueUrl(): Promise<string | undefined> {
        return this.getOutputValue(this.queueUrlOutput);
    }
}
