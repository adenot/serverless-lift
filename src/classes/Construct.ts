import { PolicyStatement } from "../CloudFormation";
import { AwsProvider } from "./AwsProvider";
import { CliOptions } from "../types/serverless";

/**
 * Defines which methods a Lift construct must expose.
 */
export interface ConstructInterface {
    outputs(): Record<string, () => Promise<string | undefined>>;

    /**
     * CloudFormation references
     */
    references(): Record<string, Record<string, unknown>>;

    /**
     * Post-CloudFormation deployment
     */
    postDeploy?(): Promise<void>;

    /**
     * Pre-CloudFormation deletion
     */
    preRemove?(): Promise<void>;

    /**
     * IAM permissions to add to Lambda functions of the stack
     */
    permissions?(): PolicyStatement[];
}

/**
 * Defines which static properties and methods a Lift construct must expose.
 */
export interface StaticConstructInterface {
    type: string;
    schema: {
        type: "object";
        [k: string]: unknown;
    };
    commands?: ConstructCommands;
    create(provider: AwsProvider, id: string, configuration: Record<string, unknown>): ConstructInterface;
}

export type ConstructCommands = Record<string, ConstructCommandDefinition>;
type ConstructCommandDefinition = {
    usage: string;
    handler: (options: CliOptions) => void | Promise<void>;
    options?: {
        [name: string]: {
            usage: string;
            type: string;
            required?: boolean;
            shortcut?: string;
        };
    };
};
