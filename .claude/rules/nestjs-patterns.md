---
paths:
  - "apps/notiflo/**/*.ts"
  - "!apps/notiflo/**/*.spec.ts"
---

# NestJS Service & Module Rules

## Module Pattern
Every module that exports a service MUST provide both class and string token:
```typescript
@Module({
  providers: [
    MyService,
    { provide: 'MyService', useExisting: MyService },
  ],
  exports: [MyService, 'MyService'],
})
```
Forgetting the string token alias causes "can't resolve dependencies" errors in consuming modules.

## Service Pattern
```typescript
@Injectable()
export class MyService implements OnModuleInit {
  private readonly logger = new Logger(MyService.name);

  async onModuleInit() { /* startup logic */ }
}
```

## Controller Pattern
- `@Controller('feature-name')` for route prefix
- Return objects directly — NestJS serializes to JSON
- Use `class-validator` decorators on DTOs
- `@UsePipes(new ValidationPipe({ transform: true }))` or global pipe

## Mongoose Model Registration
**Critical:** The name in `@InjectModel('X')` must EXACTLY match `MongooseModule.forFeature([{ name: 'X', schema }])`.
This has caused real bugs. Always verify both files when creating or modifying a schema.

## Dependency Injection
- Use `@Optional()` with `@Inject(TOKEN)` when a dependency might not exist
- Use `forwardRef(() => Module)` for circular module dependencies
- The `ENGINE_BRIDGE` token uses `@Optional()` so the app works without the Rust addon

## Scaffolding — Use NX CLI
NEVER manually create modules, services, or controllers. Always:
```bash
npx nx generate @nx/nest:resource feature-name --project=notiflo
npx nx generate @nx/nest:service service-name --project=notiflo
npx nx generate @nx/nest:module module-name --project=notiflo
```
