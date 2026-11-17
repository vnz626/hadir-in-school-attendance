import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AcademicService, AcademicYearsController, TermsController } from "./academic";
import {
  ParentsController,
  ParentsService,
  StaffPositionsController,
  StaffPositionsService,
  StudentParentsController,
  StudentParentsService,
  TeachersController,
  TeachersService,
} from "./people";
import {
  GeofencesController,
  GeofencesService,
  HolidaysController,
  HolidaysService,
  SchedulesController,
  SchedulesService,
} from "./schedule-calendar";
import { SettingsController, SettingsService } from "./settings";
import {
  ClassesController,
  ClassesService,
  SubjectsController,
  SubjectsService,
} from "./subjects-classes";

@Module({
  imports: [AuthModule],
  controllers: [
    AcademicYearsController,
    TermsController,
    SubjectsController,
    ClassesController,
    TeachersController,
    StaffPositionsController,
    ParentsController,
    StudentParentsController,
    SchedulesController,
    HolidaysController,
    GeofencesController,
    SettingsController,
  ],
  providers: [
    AcademicService,
    SubjectsService,
    ClassesService,
    TeachersService,
    StaffPositionsService,
    ParentsService,
    StudentParentsService,
    SchedulesService,
    HolidaysService,
    GeofencesService,
    SettingsService,
  ],
})
export class MasterModule {}
