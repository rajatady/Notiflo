import { DynamicModule, Module, Provider } from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { ClickhouseService } from './clickhouse.service';

export const CLICKHOUSE_CLIENT = Symbol('CLICKHOUSE_CLIENT');

export interface ClickHouseModuleOptions {
	url: string;
	database: string;
	username?: string;
	password?: string;
}

export interface ClickHouseModuleAsyncOptions {
	imports?: any[];
	useFactory: (...args: any[]) => Promise<ClickHouseModuleOptions> | ClickHouseModuleOptions;
	inject?: any[];
}

@Module({})
export class ClickhouseModule {
	static forRoot(options?: Partial<ClickHouseModuleOptions>): DynamicModule {
		const clientProvider: Provider = {
			provide: CLICKHOUSE_CLIENT,
			useFactory: () => {
				return createClient({
					url: options?.url ?? process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123',
					database: options?.database ?? process.env['CLICKHOUSE_DATABASE'] ?? 'notiflo',
					username: options?.username ?? process.env['CLICKHOUSE_USERNAME'] ?? 'default',
					password: options?.password ?? process.env['CLICKHOUSE_PASSWORD'] ?? '',
				});
			},
		};

		return {
			module: ClickhouseModule,
			global: true,
			providers: [clientProvider, ClickhouseService],
			exports: [CLICKHOUSE_CLIENT, ClickhouseService],
		};
	}

	static forRootAsync(options: ClickHouseModuleAsyncOptions): DynamicModule {
		const clientProvider: Provider = {
			provide: CLICKHOUSE_CLIENT,
			useFactory: async (...args: any[]) => {
				const config = await options.useFactory(...args);
				return createClient({
					url: config.url ?? process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123',
					database: config.database ?? process.env['CLICKHOUSE_DATABASE'] ?? 'notiflo',
					username: config.username ?? process.env['CLICKHOUSE_USERNAME'] ?? 'default',
					password: config.password ?? process.env['CLICKHOUSE_PASSWORD'] ?? '',
				});
			},
			inject: options.inject ?? [],
		};

		return {
			module: ClickhouseModule,
			global: true,
			imports: options.imports ?? [],
			providers: [clientProvider, ClickhouseService],
			exports: [CLICKHOUSE_CLIENT, ClickhouseService],
		};
	}
}
