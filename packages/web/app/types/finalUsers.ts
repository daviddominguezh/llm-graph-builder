import { AddressSchemaType } from './orders';

export interface FinalUserInfoAPI {
  name?: string;
  email?: string;
  city?: string;
  gender?: string;
  address?: string;
  nic?: string;
  userGender?: string;
  addressSchema?: AddressSchemaType;
}
