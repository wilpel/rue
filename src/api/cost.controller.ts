import { Controller, Get, Inject } from "@nestjs/common";
import { BudgetService } from "../agents/budget.service.js";

@Controller("api")
export class CostController {
  constructor(@Inject(BudgetService) private readonly budget: BudgetService) {}

  @Get("cost")
  getCost() {
    return this.budget.summary();
  }
}
