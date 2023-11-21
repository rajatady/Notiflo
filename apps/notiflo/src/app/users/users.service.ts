import {Injectable} from '@nestjs/common';
import {CreateUserDto} from './dto/create-user.dto';
import {UpdateUserDto} from './dto/update-user.dto';
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {IUser, User} from "./schemas/user.schema";
import {from} from "rxjs";

@Injectable()
export class UsersService {

  constructor(@InjectModel(User.name) private readonly usersModel: Model<IUser>) {
  }

  create(createUserDto: CreateUserDto) {
    return from(this.usersModel.create(createUserDto))
  }

  findAll() {
    return from(this.usersModel.find())
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
