import { Controller, Get, Inject } from "@nestjs/common";
import { SessionMaintenanceService } from "../database/session-maintenance.service.js";

@Controller("api")
export class MaintenanceController {
  constructor(@Inject(SessionMaintenanceService) private readonly maintenance: SessionMaintenanceService) {}

  @Get("maintenance/run")
  runMaintenance() {
    return this.maintenance.run();
  }
}
