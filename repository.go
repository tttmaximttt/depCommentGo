package main

import "github.com/jinzhu/gorm"

type Repository interface {
  Create(user *User) error
  GetByEmailAndPassword(user *User) (*User, error)
  GetByEmail(email string) (*User, error)
}

type User struct {
  Email string
  Password string
}

type UserRepository struct {
  db *gorm.DB
}

func (repo *UserRepository) GetByEmail(email string) (*User, error) {
  user := &User{}
  if err := repo.db.Where("email = ?", email).
    First(&user).Error; err != nil {
    return nil, err
  }
  return user, nil
}


func (repo *UserRepository) GetByEmailAndPassword(user *User) (*User, error) {
  if err := repo.db.First(&user).Error; err != nil {
    return nil, err
  }
  return user, nil
}

func (repo *UserRepository) Create(user *User) error {
  if err := repo.db.Create(user).Error; err != nil {
    return err
  }
  return nil
}